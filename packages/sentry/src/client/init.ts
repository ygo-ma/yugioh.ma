import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";
import { CAPTURED } from "../shared/captured";
import { envToBool } from "../shared/env";

/**
 * Initialize the browser-side Sentry SDK and wire it into the TanStack Router.
 *
 * Reads `VITE_SENTRY_*` env vars (set by `sentryPlugin()` in `@acme/sentry/vite`):
 *   - `VITE_SENTRY_ENABLED`     — anything truthy turns Sentry on
 *   - `VITE_SENTRY_ENVIRONMENT` — defaults to `"development"`
 *   - `VITE_SENTRY_RELEASE`
 *   - `VITE_SENTRY_DIST`
 *
 * Errors are tunneled through `/api/sentry` (the route exposed by
 * `sentryTunnelRoute` in `@acme/sentry/api`) so they bypass ad-blockers.
 *
 * Errors that were already captured server-side by `sentryFunctionMiddleware`
 * (from `@acme/sentry/middleware`) are dropped here via the `beforeSend`
 * filter, preventing the same error from being reported twice.
 */
export function initSentryClient(router: AnyRouter): void {
  if (router.isServer) return;

  const {
    VITE_SENTRY_ENABLED,
    VITE_SENTRY_ENVIRONMENT,
    VITE_SENTRY_RELEASE,
    VITE_SENTRY_DIST,
  } = import.meta.env;
  if (!envToBool(VITE_SENTRY_ENABLED)) return;

  Sentry.init({
    dsn: "https://reporter@errors.internal/0",
    tunnel: "/api/sentry",
    environment: VITE_SENTRY_ENVIRONMENT ?? "development",
    release: VITE_SENTRY_RELEASE,
    dist: VITE_SENTRY_DIST,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],

    beforeSend(event, { originalException }) {
      if (originalException instanceof Error && CAPTURED in originalException) {
        return null;
      }

      return event;
    },
  });
}
