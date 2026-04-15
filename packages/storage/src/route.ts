import { Hono } from "hono";
import type { MiddlewareHandler } from "hono/types";
import { HTTPException } from "hono/http-exception";
import type { BucketConfig, BucketMap, Storage, StorageEnvVars } from "./types";

type VerifyFn = (
  bucket: string,
  key: string,
  expires: string | undefined,
  token: string | undefined,
  signingKey: string,
) => Promise<void>;

interface MediaEnv {
  Bindings: StorageEnvVars;
  Variables: { storage: Record<string, Storage> };
}

function serveFile(
  data: Uint8Array,
  meta: Record<string, unknown>,
  isPublic: boolean,
): Response {
  const headers = new Headers({
    "Content-Type":
      typeof meta.contentType === "string"
        ? meta.contentType
        : "application/octet-stream",
    "Content-Length": String(data.byteLength),
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
  env: StorageEnvVars;
  req: {
    param(name: string): string;
    query(name: string): string | undefined;
  };
  var: { storage: Record<string, Storage> };
}

function buildGetHandler(
  bucket: string,
  config: BucketConfig,
  isProxyDisabled: (bucket: string, env: StorageEnvVars) => boolean,
  verify: VerifyFn,
) {
  return async (context: MediaContext) => {
    if (isProxyDisabled(bucket, context.env)) {
      throw new HTTPException(404, {
        message: "use direct or presigned URLs for this bucket",
      });
    }

    const key = context.req.param("key");
    if (!key) {
      throw new HTTPException(400, { message: "missing key" });
    }
    if (key.endsWith("$")) {
      throw new HTTPException(404, {
        message: "file not found",
      });
    }

    if (!config.public) {
      await authorizePrivate(
        bucket,
        key,
        context.env.STORAGE_SIGNING_KEY,
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

export function createMediaRoute(
  bucketConfig: BucketMap,
  middleware: MiddlewareHandler,
  isProxyDisabled: (bucket: string, env: StorageEnvVars) => boolean,
  verify: VerifyFn,
) {
  const route = new Hono<MediaEnv>().use(middleware);

  for (const [bucket, config] of Object.entries(bucketConfig)) {
    const handler = buildGetHandler(bucket, config, isProxyDisabled, verify);
    route.get(`/${bucket}/:key{.+}`, handler);
  }

  return route;
}
