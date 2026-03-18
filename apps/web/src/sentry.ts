import * as Sentry from "@sentry/tanstackstart-react";
import type { getRouter } from "./router";

export function initSentryClient(router: ReturnType<typeof getRouter>): void {
  if (router.isServer) return;

  const { VITE_SENTRY_DSN, VITE_SENTRY_ENVIRONMENT, VITE_SENTRY_RELEASE } =
    import.meta.env;
  if (VITE_SENTRY_DSN === undefined || VITE_SENTRY_DSN === "") return;

  Sentry.init({
    dsn: VITE_SENTRY_DSN,
    environment: VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: VITE_SENTRY_RELEASE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
  });
}
