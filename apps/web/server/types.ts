import type { D1Database } from "@cloudflare/workers-types";

export interface CfBindings {
  DB?: D1Database;
  BASIC_AUTH_CREDENTIALS?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_DIST?: string;
}
