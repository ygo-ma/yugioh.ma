import * as Sentry from "@sentry/react";
import type { getRouter } from "./router";

export function initSentryClient(router: ReturnType<typeof getRouter>): void {
  if (router.isServer) return;

  const {
    VITE_SENTRY_DSN,
    VITE_SENTRY_ENVIRONMENT,
    VITE_SENTRY_RELEASE,
    VITE_SENTRY_DIST,
  } = import.meta.env;
  if (!VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: VITE_SENTRY_DSN,
    environment: VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: VITE_SENTRY_RELEASE,
    dist: VITE_SENTRY_DIST,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
  });
}
