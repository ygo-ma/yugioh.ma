import { createMiddleware } from "hono/factory";
import { createMediaRoute as createMediaRouteImpl } from "./route";
import { createResolveStorage } from "./resolve";
import { createPresignUrl, verifyHmacToken } from "./signing";
import type { BucketMap, StorageKitConfig } from "./types";
import { createUrlUtils } from "./url";

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
  const resolveStorage = createResolveStorage(bucketConfig, s3, kvBindingName);
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
