import type { SentryBindings } from "@acme/sentry/server";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type { Cache } from "@acme/cache";
import type { Storage, StorageBindings, StorageEnvVars } from "@acme/storage";
import type { Database } from "../db";
import type { BucketName } from "../storage";

export interface EnvVars extends SentryBindings, StorageEnvVars {
  // ── Database ──
  DATABASE_URL?: string;

  // ── Cache ──
  CACHE_URL?: string;

  // ── Auth ──
  BASIC_AUTH_CREDENTIALS?: string;
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
