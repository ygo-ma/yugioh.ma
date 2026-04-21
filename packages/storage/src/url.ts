import { KEY_SEPARATOR } from "./driver";
import type { BucketMap } from "./types";

/**
 * Percent-encodes each path segment of a storage key.
 *
 * `/` is preserved as the separator (R2/S3/the proxy route treat it
 * as a literal in keys).
 *
 * Required for keys with spaces, `?`, `#`, or non-ASCII; otherwise
 * the URL parser truncates or misinterprets them.
 */
export function encodeKeyPath(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function createUrlUtils<TEnv, TBucket extends string>(
  bucketConfig: BucketMap<TEnv, TBucket>,
) {
  /**
   * Returns the actual key in the bucket, including the prefix if configured.
   */
  function storageKey(bucket: TBucket, env: TEnv, key: string): string {
    const prefix = bucketConfig[bucket].keyPrefix(env);
    return prefix ? `${prefix}${KEY_SEPARATOR}${key}` : key;
  }

  /**
   * Returns a stable URL for a file.
   * Public bucket with `baseUrl` -> direct URL, otherwise -> proxy path.
   */
  function urlFor(bucket: TBucket, env: TEnv, key: string): string {
    const cfg = bucketConfig[bucket];
    const base = cfg.public ? cfg.baseUrl(env) : null;
    if (base) {
      const path = encodeKeyPath(storageKey(bucket, env, key));
      return `${base.replace(/\/$/u, "")}/${path}`;
    }
    return `/media/${bucket}/${encodeKeyPath(key)}`;
  }

  return { storageKey, urlFor };
}
