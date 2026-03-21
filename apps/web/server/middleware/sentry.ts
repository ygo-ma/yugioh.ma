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
import type { CfBindings } from "../types";

// Rebuilt from @sentry/core — the composed defaultStackParser isn't exported.
const stackParser = createStackParser(nodeStackLineParser());

// Init Sentry for server functions + SSR
// note: wrapRequestHandler only covers /api/*.
// Manual CloudflareClient because @sentry/cloudflare doesn't export init().
export default defineEventHandler((event) => {
  if (!isInitialized()) {
    const cfEnv = event.runtime?.cloudflare?.env as CfBindings | undefined;
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
