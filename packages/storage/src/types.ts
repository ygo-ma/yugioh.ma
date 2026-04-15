import type { R2Bucket } from "@cloudflare/workers-types";
import type { Storage } from "unstorage";

export type { Storage };

export interface S3Credentials {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export interface StorageBindings {
  STORAGE_PUBLIC?: R2Bucket;
  STORAGE_PRIVATE?: R2Bucket;
}

export type UserEnv = unknown;

export interface BucketConfig<TEnv = UserEnv> {
  /** Whether anonymous reads are allowed (no auth, public Cache-Control). */
  public: boolean;
  /** Returns the R2 binding for this bucket, if configured. */
  r2Binding: (env: TEnv) => R2Bucket | undefined;
  /** Returns the S3-compatible bucket name (from env or default). */
  s3BucketName: (env: TEnv) => string;
  /** Direct URL base for serving files. Null = use proxy. */
  baseUrl: (env: TEnv) => string | null;
  /** Optional key prefix for namespacing within the bucket. */
  keyPrefix: (env: TEnv) => string | null;
}

export type BucketMap<TEnv = UserEnv, TBucket extends string = string> = Record<
  TBucket,
  BucketConfig<TEnv>
>;

export type SigningKeyFn<TEnv = UserEnv> = (env: TEnv) => string | undefined;
export type S3Fn<TEnv = UserEnv> = (env: TEnv) => S3Credentials | undefined;
export type KvBindingNameFn<TEnv = UserEnv> = (env: TEnv) => string | undefined;

export interface StorageKitConfig<TEnv, TBuckets extends BucketMap<TEnv>> {
  buckets: TBuckets;
  /** HMAC signing key for private file proxy URLs. */
  signingKey?: SigningKeyFn<TEnv>;
  /** S3-compatible credentials. Return undefined to skip S3. */
  s3?: S3Fn<TEnv>;
  /** KV binding name for Cloudflare Workers fallback. */
  kvBindingName?: KvBindingNameFn<TEnv>;
}
