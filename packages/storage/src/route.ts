import { Hono, type Context } from "hono";
import type { MiddlewareHandler } from "hono/types";
import { HTTPException } from "hono/http-exception";
import {
  cacheControlFor,
  type StorageDriver,
  type StorageObject,
} from "./driver";
import type { BucketConfig, BucketMap, S3Fn, SigningKeyFn } from "./types";

type VerifyFn = (
  bucket: string,
  key: string,
  expires: string | undefined,
  token: string | undefined,
  signingKey: string,
) => Promise<void>;

/**
 * True when the proxy must refuse to serve because a better access path exists.
 */
function isProxyDisabled<TEnv>(
  config: BucketConfig<TEnv>,
  env: TEnv,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
): boolean {
  if (config.public && config.baseUrl(env)) {
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

interface MediaEnv<TEnv extends object> {
  Bindings: TEnv;
  Variables: { storage: Record<string, StorageDriver> };
}

function serveFile(object: StorageObject, isPublic: boolean): Response {
  const headers = new Headers({
    "Content-Type": object.contentType,
    "Cache-Control": object.cacheControl ?? cacheControlFor(isPublic),
    "X-Content-Type-Options": "nosniff",
  });

  if (object.size !== null) {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(object.body, { status: 200, headers });
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
    const message = "private storage access is not configured";
    throw new HTTPException(503, { message });
  }

  await verify(bucket, key, expires, token, signingKey);
}

function buildGetHandler<TEnv extends object>(
  bucket: string,
  config: BucketConfig<TEnv>,
  verify: VerifyFn,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
) {
  return async ({ env, req, var: vars }: Context<MediaEnv<TEnv>>) => {
    if (isProxyDisabled(config, env, signingKey, s3)) {
      const message = "use direct or presigned URLs for this bucket";
      throw new HTTPException(404, { message });
    }

    const key = req.param("key");
    if (!key) {
      throw new HTTPException(400, { message: "missing key" });
    }

    if (!config.public) {
      await authorizePrivate(
        bucket,
        key,
        signingKey(env),
        req.query("expires"),
        req.query("token"),
        verify,
      );
    }

    const storage = vars.storage[bucket];
    if (!storage) {
      throw new HTTPException(500, { message: "bucket not resolved" });
    }

    const object = await storage.get(key);
    if (!object) {
      throw new HTTPException(404, { message: "file not found" });
    }

    return serveFile(object, config.public);
  };
}

export function createMediaRoute<TEnv extends object>(
  bucketConfig: BucketMap<TEnv>,
  middleware: MiddlewareHandler,
  verify: VerifyFn,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
) {
  const route = new Hono<MediaEnv<TEnv>>().use(middleware);

  for (const [bucket, config] of Object.entries(bucketConfig)) {
    const handler = buildGetHandler(bucket, config, verify, signingKey, s3);
    route.get(`/${bucket}/:key{.+}`, handler);
  }

  return route;
}
