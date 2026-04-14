import type { SentryBindings } from "@acme/sentry/server";
import type {
  D1Database,
  KVNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";
import type { Cache } from "@acme/cache";
import type { Database } from "../db";
import type { Buckets } from "../storage/types";

export interface EnvVars extends SentryBindings {
  // ── Database ──
  DATABASE_URL?: string;

  // ── Cache ──
  CACHE_URL?: string;

  // ── Storage: direct URL for the public bucket ──
  // CDN, R2 custom domain, etc. When set, the /media proxy returns 404
  // for this bucket and urlFor() returns this URL instead.
  STORAGE_URL_PUBLIC?: string;

  // ── Storage: per-bucket key prefixes ──
  // Namespace objects within a bucket (e.g., branch slug for CI preview
  // isolation, or per-prefix visibility rules on a shared S3 bucket).
  STORAGE_PREFIX_PUBLIC?: string;
  STORAGE_PREFIX_PRIVATE?: string;

  // ── Storage: HMAC signing key ──
  // When set, private files are served through the /media proxy with
  // HMAC token verification. Takes priority over S3 presigning.
  STORAGE_SIGNING_KEY?: string;

  // ── Storage: S3-compatible backend ──
  // Used as the storage driver when R2 bindings are absent,
  // and for generating presigned URLs (direct-to-bucket downloads).
  // Works with AWS S3, MinIO, Cloudflare R2's S3-compatible endpoint, etc.
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
  S3_BUCKET_PUBLIC?: string;
  S3_BUCKET_PRIVATE?: string;

  // ── Storage: KV fallback (Cloudflare only) ──
  // Names a KV binding to use for storage when R2 and S3 are absent.
  // Set to "CACHE" to reuse the cache namespace (free tier).
  KV_STORAGE?: string;

  // ── Auth ──
  BASIC_AUTH_CREDENTIALS?: string;
}

export interface CfBindings extends EnvVars {
  DB?: D1Database;
  CACHE?: KVNamespace;
  STORAGE_PUBLIC?: R2Bucket;
  STORAGE_PRIVATE?: R2Bucket;
}

export interface AppEnv {
  Bindings: CfBindings;
  Variables: {
    db: Database;
    cache: Cache;
    storage: Buckets;
  };
}

declare module "nitro/h3" {
  interface H3EventContext {
    env: EnvVars;
  }
}
