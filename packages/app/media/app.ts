import { sentryHonoErrorHandler } from "@acme/sentry/api";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../server/types";
import {
  isProxyDisabled,
  storageMiddleware,
  verifyHmacToken,
} from "../storage";
import { BUCKET_NAMES, BUCKETS, type BucketName } from "../storage/buckets";

function buildGetHandler(bucket: BucketName) {
  return async (context: Context<AppEnv>) => {
    // When a direct access path exists (S3 presigning or public URL),
    // the proxy must not serve as an alternative.
    if (isProxyDisabled(bucket, context.env)) {
      throw new HTTPException(404, {
        message: "use direct or presigned URLs for this bucket",
      });
    }

    const key = context.req.param("key");
    if (!key) throw new HTTPException(400, { message: "missing key" });

    // Block access to metadata sidecar keys (unstorage's $ suffix).
    if (key.endsWith("$")) {
      throw new HTTPException(404, { message: "file not found" });
    }

    // Private buckets require a valid HMAC token.
    if (!BUCKETS[bucket].public) {
      const signingKey = context.env.STORAGE_SIGNING_KEY;
      if (!signingKey) {
        throw new HTTPException(503, {
          message: "private storage access is not configured",
        });
      }

      const expires = context.req.query("expires");
      const token = context.req.query("token");
      await verifyHmacToken(bucket, key, expires, token, signingKey);
    }

    const storage = context.var.storage[bucket];
    const data = await storage.getItemRaw<Uint8Array>(key);
    if (!data) throw new HTTPException(404, { message: "file not found" });

    const meta = await storage.getMeta(key);
    const headers = new Headers({
      "Content-Type":
        typeof meta.contentType === "string"
          ? meta.contentType
          : "application/octet-stream",
      "Content-Length": String(data.byteLength),
    });
    if (BUCKETS[bucket].public) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    return new Response(new Uint8Array(data), { status: 200, headers });
  };
}

const media = new Hono<AppEnv>()
  .onError(sentryHonoErrorHandler)
  .basePath("/media")
  .use(storageMiddleware);

for (const bucket of BUCKET_NAMES) {
  media.get(`/${bucket}/:key{.+}`, buildGetHandler(bucket));
}

export default media;
