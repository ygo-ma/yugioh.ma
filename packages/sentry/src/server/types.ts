/**
 * Cloudflare environment bindings consumed by the Sentry server-side
 * middleware and error handler. The host app's full bindings interface
 * should `extends SentryBindings` so the same `env` object can be passed
 * around without manual type juggling.
 */
export interface SentryBindings {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_DIST?: string;
}
