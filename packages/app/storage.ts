import { createStorageKit } from "@acme/storage";
import type { CfBindings } from "./server/types";

export const {
  bucketConfig,
  resolveStorage,
  storageMiddleware,
  createMediaRoute,
  presignUrl,
  verifyHmacToken,
  isProxyDisabled,
  storageKey,
  urlFor,
} = createStorageKit({
  public: {
    public: true,
    r2Binding: (env: CfBindings) => env.STORAGE_PUBLIC,
    s3BucketName: (env: CfBindings) => env.S3_BUCKET_PUBLIC ?? "acme-public",
    baseUrl: (env: CfBindings) => env.STORAGE_URL_PUBLIC ?? null,
    keyPrefix: (env: CfBindings) => env.STORAGE_PREFIX_PUBLIC ?? null,
  },
  private: {
    public: false,
    r2Binding: (env: CfBindings) => env.STORAGE_PRIVATE,
    s3BucketName: (env: CfBindings) => env.S3_BUCKET_PRIVATE ?? "acme-private",
    baseUrl: () => null,
    keyPrefix: (env: CfBindings) => env.STORAGE_PREFIX_PRIVATE ?? null,
  },
});

export type BucketName = keyof typeof bucketConfig;
