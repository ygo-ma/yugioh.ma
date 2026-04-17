import { wrapRequestHandler } from "@sentry/cloudflare";
import type { ExecutionContext } from "@cloudflare/workers-types";
import type { SentryBindings } from "../server/types";

/**
 * Optionally wraps a request handler with Sentry error tracking. When a
 * Sentry DSN and a CF Workers execution context are available, the handler
 * runs inside `@sentry/cloudflare`'s `wrapRequestHandler`; otherwise the
 * handler is called directly.
 */
export function withSentry(
  env: SentryBindings,
  request: Request,
  context: ExecutionContext | undefined,
  handler: () => Response | Promise<Response>,
): Response | Promise<Response> {
  const dsn = env.SENTRY_DSN;

  if (!dsn || !context) return handler();

  return wrapRequestHandler(
    {
      options: {
        dsn,
        environment: env.SENTRY_ENVIRONMENT ?? "development",
        release: env.SENTRY_RELEASE,
        dist: env.SENTRY_DIST,
      },
      request,
      context,
      captureErrors: true,
    },
    handler,
  );
}
