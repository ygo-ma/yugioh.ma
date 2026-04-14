import type { AppEnv } from "../server/types";
import { BUCKETS, type BucketName } from "./buckets";

function hasS3Creds(env: AppEnv["Bindings"]): boolean {
  return Boolean(
    env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY,
  );
}

/**
 * True when the proxy must refuse to serve because a better access path
 * exists.
 */
export function isProxyDisabled(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): boolean {
  // Explicit direct URL configured — proxy not needed.
  if (BUCKETS[bucket].baseUrl(env)) {
    return true;
  }

  // HMAC signing key set — admin wants the proxy path (e.g., S3
  // endpoint is internal and not reachable from the browser).
  if (env.STORAGE_SIGNING_KEY) {
    return false;
  }

  // Private bucket with S3 creds — use S3 presigned URLs directly.
  // Public buckets fall through to proxy (S3 endpoint may not serve
  // anonymous reads, e.g., R2).
  if (!BUCKETS[bucket].public && hasS3Creds(env)) {
    return true;
  }

  return false;
}

/**
 * Returns the actual key in the bucket, including the prefix if
 * configured. Uses unstorage's `:` separator.
 */
export function storageKey(
  bucket: BucketName,
  env: AppEnv["Bindings"],
  key: string,
): string {
  const prefix = BUCKETS[bucket].keyPrefix(env);
  return prefix ? `${prefix}:${key}` : key;
}

/**
 * Returns a stable URL for a file. Bucket with a `baseUrl` configured →
 * direct URL. Otherwise → the backend proxy path.
 */
export function urlFor(
  bucket: BucketName,
  env: AppEnv["Bindings"],
  key: string,
): string {
  const base = BUCKETS[bucket].baseUrl(env);
  // Direct URL needs the full prefixed key (bypasses proxy → hits bucket).
  // Proxy URL uses the raw key (prefixStorage adds the prefix on read).
  if (base)
    return `${base.replace(/\/$/u, "")}/${storageKey(bucket, env, key)}`;
  return `/media/${bucket}/${key}`;
}
