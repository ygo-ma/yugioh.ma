import type { SentryBindings } from "@acme/sentry/server";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type { Cache } from "../cache/types";
import type { Database } from "../db/types";

export interface EnvVars extends SentryBindings {
  DATABASE_URL?: string;
  CACHE_URL?: string;
  BASIC_AUTH_CREDENTIALS?: string;
}

export interface CfBindings extends EnvVars {
  DB?: D1Database;
  CACHE?: KVNamespace;
}

export interface AppEnv {
  Bindings: CfBindings;
  Variables: {
    db: Database;
    cache: Cache;
  };
}

declare module "nitro/h3" {
  interface H3EventContext {
    env: EnvVars;
  }
}
