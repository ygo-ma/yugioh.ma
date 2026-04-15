import type { SentryBindings } from "@acme/sentry/server";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type { Cache } from "@acme/cache";
import type { Storage, StorageBindings } from "@acme/storage";
import type { Database } from "../db";
import type { BucketName } from "../storage";

export interface EnvVars extends SentryBindings {
  // ── Database ──
  DATABASE_URL?: string;

  // ── Cache ──
  CACHE_URL?: string;

  // ── Auth ──
  BASIC_AUTH_CREDENTIALS?: string;

  // ── Storage: HMAC signing key ──
  STORAGE_SIGNING_KEY?: string;

  // ── Storage: direct URL / key prefixes ──
  STORAGE_URL_PUBLIC?: string;
  STORAGE_PREFIX_PUBLIC?: string;
  STORAGE_PREFIX_PRIVATE?: string;

  // ── Storage: S3-compatible backend ──
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
  S3_BUCKET_PUBLIC?: string;
  S3_BUCKET_PRIVATE?: string;

  // ── Storage: KV fallback binding name ──
  KV_STORAGE?: string;
}

export interface CfBindings extends EnvVars, StorageBindings {
  DB?: D1Database;
  CACHE?: KVNamespace;
}

export interface AppEnv {
  Bindings: CfBindings;
  Variables: {
    db: Database;
    cache: Cache;
    storage: Record<BucketName, Storage>;
  };
}

declare module "nitro/h3" {
  interface H3EventContext {
    env: EnvVars;
  }
}
