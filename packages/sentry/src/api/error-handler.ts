import * as Sentry from "@sentry/cloudflare";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Hono error handler that forwards uncaught API errors to Sentry and turns
 * them into JSON 500 responses.
 *
 * - `HTTPException`s pass through unchanged. Ones with `status >= 500` are
 *   reported, the rest aren't (they're expected client-error responses).
 * - Anything else is captured and returned as `{ error, sentryEventId }`
 *   so the frontend can surface the event ID for support.
 *
 * The current Sentry scope is enriched with the request IP, URL, and method.
 *
 * Wire it into your root Hono app:
 *
 * ```ts
 * import { sentryHonoErrorHandler } from "@acme/sentry/api";
 *
 * new Hono().onError(sentryHonoErrorHandler).route(...)
 * ```
 */
const sentryHonoErrorHandler: ErrorHandler = (error, context) => {
  // Enrich the Sentry scope
  const ip =
    context.req.header("cf-connecting-ip") ??
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim();

  const scope = Sentry.getCurrentScope();
  scope.setUser({ ip_address: ip });
  scope.setExtra("url", context.req.url);
  scope.setExtra("method", context.req.method);

  // Capture the error and send it to sentry
  if (error instanceof HTTPException) {
    if (error.status >= 500) {
      Sentry.captureException(error);
    }
    return error.getResponse();
  }

  const eventId = Sentry.captureException(error);
  return context.json(
    { error: "Internal Server Error", sentryEventId: eventId },
    500,
  );
};

export default sentryHonoErrorHandler;
