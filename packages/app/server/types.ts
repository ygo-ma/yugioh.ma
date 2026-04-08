import type { SentryBindings } from "@acme/sentry/server";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface CfBindings extends SentryBindings {
  DB?: D1Database;
  CACHE?: KVNamespace;
  BASIC_AUTH_CREDENTIALS?: string;
}
