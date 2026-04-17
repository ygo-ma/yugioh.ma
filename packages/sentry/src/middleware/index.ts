import { isRedirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { CAPTURED } from "../shared/captured";

/**
 * TanStack Start function middleware that captures server-function errors
 * with Sentry and prevents the same error from being captured twice.
 *
 * `.client()` — runs in the browser when a server function call fails.
 *   Marks the deserialized error so the client-side `Sentry.ErrorBoundary`
 *   skips re-capturing it via the `beforeSend` filter set up by
 *   `initSentryClient`. Uses `Object.defineProperty` to keep the marker
 *   non-enumerable (it won't show up in `JSON.stringify` or `Object.keys`).
 *
 * `.server()` — runs on the backend when a server function throws.
 *   Calls `Sentry.captureException` so the error is reported server-side.
 *   `@sentry/cloudflare` is lazy-imported so the client bundle stays slim.
 *   TanStack Start's control-flow throws (`redirect()` Responses, bare
 *   `Response` instances) are re-thrown without capture — they are the
 *   framework's normal way to return HTTP responses, not errors.
 *
 * Register it in your TanStack Start config:
 *
 * ```ts
 * import { createStart } from "@tanstack/react-start";
 * import { sentryFunctionMiddleware } from "@acme/sentry/middleware";
 *
 * export const startInstance = createStart(() => ({
 *   functionMiddleware: [sentryFunctionMiddleware],
 * }));
 * ```
 */
export const sentryFunctionMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof Error) {
        Object.defineProperty(error, CAPTURED, { value: true });
      }

      throw error;
    }
  })
  .server(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (isRedirect(error) || error instanceof Response) {
        throw error;
      }

      try {
        const Sentry = await import("@sentry/cloudflare");
        Sentry.captureException(error);
        await Sentry.flush(2000);
      } catch {
        // Sentry SDK not initialized (no DSN configured)
      }

      throw error;
    }
  });
