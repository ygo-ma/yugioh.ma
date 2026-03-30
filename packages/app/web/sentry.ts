import * as Sentry from "@sentry/react";
import type { getRouter } from "./router";
import { CAPTURED } from "./middleware/sentry";

function envToBool(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  if (lower === "false" || lower === "no" || lower === "off") return false;
  const num = Number(lower);
  if (!Number.isNaN(num)) return num !== 0;
  return true;
}

export function initSentryClient(router: ReturnType<typeof getRouter>): void {
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

    // Drop errors that were already captured server-side by the Sentry
    // middleware in src/middleware/sentry.ts. The middleware's .client()
    // handler marks these errors with a non-enumerable property before
    // they reach the ErrorBoundary.
    beforeSend(event, { originalException }) {
      if (originalException instanceof Error && CAPTURED in originalException) {
        return null;
      }

      return event;
    },
  });
}
