import * as Sentry from "@sentry/cloudflare";
import {
  CloudflareClient,
  createTransport,
  getDefaultIntegrations,
  isInitialized,
  setCurrentClient,
} from "@sentry/cloudflare";
import { createStackParser, nodeStackLineParser } from "@sentry/core";
import { defineEventHandler, getRequestURL } from "nitro/h3";
import type { SentryBindings } from "./types";

// Rebuilt from @sentry/core — the composed defaultStackParser isn't exported.
const stackParser = createStackParser(nodeStackLineParser());

/**
 * Nitro middleware that lazily initializes Sentry on the first request and
 * enriches the current scope with request-level context (IP, URL, method).
 *
 * Manual `CloudflareClient` construction is required because
 * `@sentry/cloudflare` doesn't expose an `init()` helper. The companion
 * `wrapRequestHandler` (used by `createApiEventHandler` from
 * `@acme/sentry/api`) only covers `/api/*`, so this middleware exists to
 * cover SSR + TanStack Start server functions.
 *
 * Re-exported as the default export of `@acme/sentry/server` so the host app
 * can drop a 2-line shim into `server/middleware/sentry.ts` for Nitro's
 * filesystem-based middleware discovery.
 */
export default defineEventHandler((event) => {
  if (!isInitialized()) {
    const cfEnv = event.runtime?.cloudflare?.env as SentryBindings | undefined;
    const env = cfEnv ?? process.env;
    const dsn = env.SENTRY_DSN;
    if (!dsn) return;

    const client = new CloudflareClient({
      dsn,
      environment: env.SENTRY_ENVIRONMENT ?? "development",
      release: env.SENTRY_RELEASE,
      dist: env.SENTRY_DIST,
      integrations: getDefaultIntegrations({}),
      stackParser,
      transport: (options) =>
        createTransport(options, (request) =>
          fetch(options.url, {
            body: request.body,
            method: "POST",
            headers: options.headers,
          }).then((response) => ({
            statusCode: response.status,
            headers: {
              "x-sentry-rate-limits":
                response.headers.get("X-Sentry-Rate-Limits") ?? null,
              "retry-after": response.headers.get("Retry-After") ?? null,
            },
          })),
        ),
    });

    setCurrentClient(client);
    client.init();
  }

  if (!isInitialized()) return;

  const headers = event.req.headers;
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const scope = Sentry.getCurrentScope();
  scope.setUser({ ip_address: ip });
  scope.setExtra("url", getRequestURL(event).toString());
  scope.setExtra("method", event.req.method);
});
