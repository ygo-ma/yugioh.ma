import type { SentryBindings } from "@acme/sentry/server";
import type {
  D1Database,
  KVNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";
import type { Cache } from "../cache/types";
import type { Database } from "../db/types";
import type { Buckets } from "../storage/types";

export interface CfBindings extends SentryBindings {
  // Database namespace
  DB?: D1Database;
  // KV namespace
  CACHE?: KVNamespace;
  // R2 public bucket
  STORAGE_PUBLIC?: R2Bucket;
  // Direct URL for the public bucket (R2 custom domain, CDN, etc.)
  STORAGE_URL_PUBLIC?: string;
  // R2 private bucket
  STORAGE_PRIVATE?: R2Bucket;
  STORAGE_PREFIX_PUBLIC?: string;
  STORAGE_PREFIX_PRIVATE?: string;
  STORAGE_SIGNING_KEY?: string;
  // Optional alternative R2 storage for testing or other purposes
  // Required to enable URL-signing for private R2 storage
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  // Optional S3 region and bucket names for compatibility with S3-compatible storage
  S3_REGION?: string;
  S3_BUCKET_PUBLIC?: string;
  S3_BUCKET_PRIVATE?: string;
  // Optional alternative KV storage for testing or other purposes
  KV_STORAGE?: string;
  // Optional basic auth credentials in the format "username:password"
  BASIC_AUTH_CREDENTIALS?: string;
}

export interface AppEnv {
  Bindings: CfBindings;
  Variables: {
    db: Database;
    cache: Cache;
    storage: Buckets;
  };
}
