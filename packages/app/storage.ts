import { createStorageKit } from "@acme/storage";
import type { CfBindings } from "./server/types";

export const {
  bucketConfig,
  resolveStorage,
  storageMiddleware,
  createMediaRoute,
  presignUrl,
  verifyHmacToken,
  storageKey,
  urlFor,
} = createStorageKit({
  signingKey: (env: CfBindings) => env.STORAGE_SIGNING_KEY,
  kvBindingName: (env) => env.KV_STORAGE,
  s3: (env) => {
    if (!env.S3_ENDPOINT) {
      return;
    }
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error(
        "S3_ENDPOINT is set but S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY is missing",
      );
    }
    return {
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      region: env.S3_REGION,
    };
  },
  buckets: {
    public: {
      public: true,
      r2Binding: (env) => env.STORAGE_PUBLIC,
      s3BucketName: (env) => env.S3_BUCKET_PUBLIC ?? "acme-public",
      baseUrl: (env) => env.STORAGE_URL_PUBLIC ?? null,
      keyPrefix: (env) => env.STORAGE_PREFIX_PUBLIC ?? null,
    },
    private: {
      public: false,
      r2Binding: (env) => env.STORAGE_PRIVATE,
      s3BucketName: (env) => env.S3_BUCKET_PRIVATE ?? "acme-private",
      baseUrl: () => null,
      keyPrefix: (env) => env.STORAGE_PREFIX_PRIVATE ?? null,
    },
  },
});

export type BucketName = keyof typeof bucketConfig;
