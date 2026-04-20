import { createMiddleware } from "hono/factory";
import { createMediaRoute as createMediaRouteImpl } from "./route";
import { createResolveStorage } from "./resolve";
import { createPresignUrl, verifyHmacToken } from "./signing";
import type { BucketMap, S3Fn, SigningKeyFn, StorageKitConfig } from "./types";
import { createUrlUtils } from "./url";

/**
 * Boot-time check: every private bucket must have a signing path
 * (HMAC signing key or S3 presign creds). Without one, the proxy
 * route would 503 on every request.
 */
function validateBucketConfig<TEnv extends object>(
  bucketConfig: BucketMap<TEnv>,
  env: TEnv,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
): void {
  const sigKey = signingKey(env);
  const s3Creds = s3(env);

  for (const [name, config] of Object.entries(bucketConfig)) {
    if (config.public) {
      continue;
    }
    if (sigKey) {
      continue;
    }
    if (s3Creds) {
      continue;
    }

    const message =
      `Storage bucket "${name}" is private but no signing path is ` +
      "configured. Proxy reads would 503 on every request. Set " +
      "STORAGE_SIGNING_KEY for HMAC signed URLs, or configure s3 " +
      "for S3 presign.";
    throw new Error(message);
  }
}

function createStorageMiddleware<TEnv extends object, Buckets>(
  resolve: (env: TEnv) => Promise<Buckets>,
) {
  let cachedStorage: Promise<Buckets> | null = null;
  return createMiddleware<{
    Bindings: TEnv;
    Variables: { storage: Buckets };
  }>(async (context, next) => {
    cachedStorage ??= resolve(context.env);
    try {
      context.set("storage", await cachedStorage);
    } catch (error) {
      cachedStorage = null;
      throw error;
    }
    await next();
  });
}

export function createStorageKit<
  TEnv extends object,
  const TBuckets extends BucketMap<TEnv>,
>({
  buckets,
  signingKey = () => undefined,
  s3 = () => undefined,
  kvBindingName = () => undefined,
}: StorageKitConfig<TEnv, TBuckets>) {
  const bucketConfig = buckets as Readonly<TBuckets>;
  const url = createUrlUtils(bucketConfig);
  const baseResolveStorage = createResolveStorage(
    bucketConfig,
    s3,
    kvBindingName,
  );
  const resolveStorage = async (env: TEnv) => {
    validateBucketConfig(bucketConfig, env, signingKey, s3);
    return baseResolveStorage(env);
  };
  const presignUrl = createPresignUrl(bucketConfig, url, signingKey, s3);
  const storageMiddleware = createStorageMiddleware(resolveStorage);
  const createMediaRoute = () =>
    createMediaRouteImpl(
      bucketConfig,
      storageMiddleware,
      verifyHmacToken,
      signingKey,
      s3,
    );

  return {
    bucketConfig,
    resolveStorage,
    storageMiddleware,
    createMediaRoute,
    presignUrl,
    verifyHmacToken,
    storageKey: url.storageKey,
    urlFor: url.urlFor,
  };
}
