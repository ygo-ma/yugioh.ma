import type { BucketMap, StorageEnvVars } from "./types";

function hasS3Creds(env: StorageEnvVars): boolean {
  return Boolean(
    env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY,
  );
}

export function createUrlUtils<
  TEnv extends StorageEnvVars,
  TBucket extends string,
>(bucketConfig: BucketMap<TEnv, TBucket>) {
  /** True when the proxy must refuse to serve because a better access path exists. */
  function isProxyDisabled(bucket: TBucket, env: TEnv): boolean {
    if (bucketConfig[bucket].baseUrl(env)) {
      return true;
    }

    if (env.STORAGE_SIGNING_KEY) {
      return false;
    }

    if (!bucketConfig[bucket].public && hasS3Creds(env)) {
      return true;
    }

    return false;
  }

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

  return { isProxyDisabled, storageKey, urlFor };
}
