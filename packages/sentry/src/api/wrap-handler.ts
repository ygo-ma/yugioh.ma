import { wrapRequestHandler } from "@sentry/cloudflare";
import type { Env, Hono } from "hono";
import { defineEventHandler } from "nitro/h3";
import type { SentryBindings } from "../server/types";

/**
 * Wraps a Hono app in `@sentry/cloudflare`'s `wrapRequestHandler` and exposes
 * it as a Nitro event handler. Falls back to a plain pass-through `app.fetch`
 * when no DSN is configured.
 *
 * Sentry's `wrapRequestHandler` only initializes Sentry for the requests it
 * wraps, which is why the host app also needs `sentryNitroMiddleware` to
 * cover SSR + server functions.
 *
 * Drop the result into a Nitro catch-all route file (e.g.
 * `server/api/[...].ts`):
 *
 * ```ts
 * import { createApiEventHandler } from "@acme/sentry/api";
 * import app from "../../api/app";
 *
 * export default createApiEventHandler(app);
 * ```
 */
export function createApiEventHandler<HonoEnv extends Env>(app: Hono<HonoEnv>) {
  return defineEventHandler((event) => {
    const env = (event.runtime?.cloudflare?.env ??
      process.env) as SentryBindings & HonoEnv["Bindings"];
    const dsn = env.SENTRY_DSN;
    const context = event.runtime?.cloudflare?.context;

    if (dsn && context) {
      return wrapRequestHandler(
        {
          options: {
            dsn,
            environment: env.SENTRY_ENVIRONMENT ?? "development",
            release: env.SENTRY_RELEASE,
            dist: env.SENTRY_DIST,
          },
          request: event.req,
          context,
          captureErrors: true,
        },
        () => app.fetch(event.req, env, context),
      );
    }

    return app.fetch(event.req, env, context);
  });
}
