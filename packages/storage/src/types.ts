import type { R2Bucket } from "@cloudflare/workers-types";

export type { StorageDriver, StorageObject, StoragePutOptions } from "./driver";

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

interface BucketConfigBase<TEnv = UserEnv> {
  /**
   * Returns the R2 binding for this bucket, if configured.
   */
  r2Binding: (env: TEnv) => R2Bucket | undefined;
  /**
   * Returns the S3-compatible bucket name (from env or default).
   */
  s3BucketName: (env: TEnv) => string;
  /**
   * Optional key prefix for namespacing within the bucket.
   */
  keyPrefix: (env: TEnv) => string | null;
}

/**
 * Public buckets allow anonymous reads. They may declare a `baseUrl`
 * so `urlFor()` returns a direct CDN URL instead of the proxy path.
 * The proxy then refuses requests for this bucket with 404 to keep
 * clients off the worker hot path.
 */
export interface PublicBucketConfig<
  TEnv = UserEnv,
> extends BucketConfigBase<TEnv> {
  public: true;
  /**
   * Direct URL base for serving files. Null = serve via proxy.
   */
  baseUrl: (env: TEnv) => string | null;
}

/**
 * Private buckets require a signing path (HMAC or S3 presign).
 * `baseUrl` is intentionally absent: presignUrl would hand out
 * unsigned URLs, defeating "private".
 */
export interface PrivateBucketConfig<
  TEnv = UserEnv,
> extends BucketConfigBase<TEnv> {
  public: false;
}

export type BucketConfig<TEnv = UserEnv> =
  | PublicBucketConfig<TEnv>
  | PrivateBucketConfig<TEnv>;

export type BucketMap<TEnv = UserEnv, TBucket extends string = string> = Record<
  TBucket,
  BucketConfig<TEnv>
>;

export type SigningKeyFn<TEnv = UserEnv> = (env: TEnv) => string | undefined;
export type S3Fn<TEnv = UserEnv> = (env: TEnv) => S3Credentials | undefined;
export type KvBindingNameFn<TEnv = UserEnv> = (env: TEnv) => string | undefined;

export interface StorageKitConfig<TEnv, TBuckets extends BucketMap<TEnv>> {
  buckets: TBuckets;
  /**
   * HMAC signing key for private file proxy URLs.
   */
  signingKey?: SigningKeyFn<TEnv>;
  /**
   * S3-compatible credentials. Return undefined to skip S3.
   */
  s3?: S3Fn<TEnv>;
  /**
   * KV binding name for Cloudflare Workers fallback.
   */
  kvBindingName?: KvBindingNameFn<TEnv>;
}
