import type { R2Bucket } from "@cloudflare/workers-types";
import type { Storage } from "unstorage";

export type { Storage };

export interface StorageEnvVars {
  // ── Direct URL for the public bucket (CDN / R2 custom domain) ──
  STORAGE_URL_PUBLIC?: string;

  // ── Per-bucket key prefixes ──
  STORAGE_PREFIX_PUBLIC?: string;
  STORAGE_PREFIX_PRIVATE?: string;

  // ── HMAC signing key for private file proxy URLs ──
  STORAGE_SIGNING_KEY?: string;

  // ── S3-compatible backend ──
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
  S3_BUCKET_PUBLIC?: string;
  S3_BUCKET_PRIVATE?: string;

  // ── KV fallback binding name (Cloudflare only) ──
  KV_STORAGE?: string;
}

export interface StorageBindings {
  STORAGE_PUBLIC?: R2Bucket;
  STORAGE_PRIVATE?: R2Bucket;
}

export interface BucketConfig<TEnv = StorageEnvVars> {
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

export type BucketMap<
  TEnv = StorageEnvVars,
  TBucket extends string = string,
> = Record<TBucket, BucketConfig<TEnv>>;
