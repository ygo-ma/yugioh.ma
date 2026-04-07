import type { SentryBindings } from "@acme/sentry/server";
import type { D1Database } from "@cloudflare/workers-types";

export interface CfBindings extends SentryBindings {
  DB?: D1Database;
  BASIC_AUTH_CREDENTIALS?: string;
}
