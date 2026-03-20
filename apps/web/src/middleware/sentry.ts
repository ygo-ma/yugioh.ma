import { createMiddleware } from "@tanstack/react-start";
import * as Sentry from "@sentry/cloudflare";

export const CAPTURED = "__sentryServerCaptured";

/**
 * TanStack Start function middleware that captures server function errors
 * with Sentry and prevents duplicate capture on the client.
 *
 * .server() — runs on the backend when a server function throws.
 *   Calls Sentry.captureException so the error is reported server-side.
 *
 * .client() — runs in the browser when a server function call fails.
 *   Marks the deserialized error so the client-side Sentry.ErrorBoundary
 *   (in __root.tsx) skips re-capturing it via the beforeSend filter
 *   in sentry.ts. Uses Object.defineProperty to keep the marker
 *   non-enumerable (won't appear in JSON.stringify or Object.keys).
 */
export const sentryMiddleware = createMiddleware({ type: "function" })
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
      try {
        Sentry.captureException(error);
      } catch {
        // Sentry SDK not initialized (no DSN configured)
      }

      throw error;
    }
  });
