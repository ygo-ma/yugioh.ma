import * as Sentry from "@sentry/tanstackstart-react";
import type { getRouter } from "./router";

export function initSentryClient(router: ReturnType<typeof getRouter>): void {
  if (router.isServer) return;

  const env: Record<string, unknown> = import.meta.env;
  const dsn = env.VITE_SENTRY_DSN;
  if (typeof dsn !== "string" || dsn === "") return;

  Sentry.init({
    dsn,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
  });
}
