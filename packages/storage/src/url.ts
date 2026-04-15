import type { BucketMap } from "./types";

export function createUrlUtils<TEnv, TBucket extends string>(
  bucketConfig: BucketMap<TEnv, TBucket>,
) {
  /** Returns the actual key in the bucket, including the prefix if configured. */
  function storageKey(bucket: TBucket, env: TEnv, key: string): string {
    const prefix = bucketConfig[bucket].keyPrefix(env);
    return prefix ? `${prefix}:${key}` : key;
  }

  /** Returns a stable URL for a file. Bucket with a `baseUrl` → direct URL, otherwise → proxy path. */
  function urlFor(bucket: TBucket, env: TEnv, key: string): string {
    const base = bucketConfig[bucket].baseUrl(env);
    if (base) {
      return `${base.replace(/\/$/u, "")}/${storageKey(bucket, env, key)}`;
    }
    return `/media/${bucket}/${key}`;
  }

  return { storageKey, urlFor };
}
