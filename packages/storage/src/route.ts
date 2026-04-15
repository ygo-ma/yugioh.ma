import { Hono } from "hono";
import type { MiddlewareHandler } from "hono/types";
import { HTTPException } from "hono/http-exception";
import type {
  BucketConfig,
  BucketMap,
  S3Fn,
  SigningKeyFn,
  Storage,
} from "./types";

type VerifyFn = (
  bucket: string,
  key: string,
  expires: string | undefined,
  token: string | undefined,
  signingKey: string,
) => Promise<void>;

/** True when the proxy must refuse to serve because a better access path exists. */
function isProxyDisabled<TEnv>(
  config: BucketConfig<TEnv>,
  env: TEnv,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
): boolean {
  if (config.baseUrl(env)) {
    return true;
  }

  if (signingKey(env)) {
    return false;
  }

  if (!config.public && s3(env)) {
    return true;
  }

  return false;
}

interface MediaEnv {
  Variables: { storage: Record<string, Storage> };
}

function serveFile(
  data: Uint8Array,
  meta: Record<string, unknown>,
  isPublic: boolean,
): Response {
  const headers = new Headers({
    "Content-Length": String(data.byteLength),
    "Content-Type":
      typeof meta.contentType === "string"
        ? meta.contentType
        : "application/octet-stream",
  });

  if (isPublic) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  return new Response(new Uint8Array(data), {
    status: 200,
    headers,
  });
}

async function authorizePrivate(
  bucket: string,
  key: string,
  signingKey: string | undefined,
  expires: string | undefined,
  token: string | undefined,
  verify: VerifyFn,
): Promise<void> {
  if (!signingKey) {
    throw new HTTPException(503, {
      message: "private storage access is not configured",
    });
  }

  await verify(bucket, key, expires, token, signingKey);
}

interface MediaContext {
  env: unknown;
  req: {
    param(name: string): string;
    query(name: string): string | undefined;
  };
  var: { storage: Record<string, Storage> };
}

function buildGetHandler<TEnv>(
  bucket: string,
  config: BucketConfig<TEnv>,
  verify: VerifyFn,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
) {
  return async (context: MediaContext) => {
    const env = context.env as TEnv;

    if (isProxyDisabled(config, env, signingKey, s3)) {
      const message = "use direct or presigned URLs for this bucket";
      throw new HTTPException(404, { message });
    }

    const key = context.req.param("key");
    if (!key) {
      throw new HTTPException(400, { message: "missing key" });
    }
    if (key.endsWith("$")) {
      throw new HTTPException(404, { message: "file not found" });
    }

    if (!config.public) {
      await authorizePrivate(
        bucket,
        key,
        signingKey(env),
        context.req.query("expires"),
        context.req.query("token"),
        verify,
      );
    }

    const storage = context.var.storage[bucket];
    if (!storage) {
      throw new HTTPException(500, { message: "bucket not resolved" });
    }

    const data = await storage.getItemRaw<Uint8Array>(key);
    if (!data) {
      throw new HTTPException(404, { message: "file not found" });
    }

    return serveFile(data, await storage.getMeta(key), config.public);
  };
}

export function createMediaRoute<TEnv>(
  bucketConfig: BucketMap<TEnv>,
  middleware: MiddlewareHandler,
  verify: VerifyFn,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
) {
  const route = new Hono<MediaEnv>().use(middleware);

  for (const [bucket, config] of Object.entries(bucketConfig)) {
    const handler = buildGetHandler(bucket, config, verify, signingKey, s3);
    route.get(`/${bucket}/:key{.+}`, handler);
  }

  return route;
}
