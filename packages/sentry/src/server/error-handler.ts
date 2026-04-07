import * as Sentry from "@sentry/cloudflare";
import type { NitroErrorHandler } from "nitro/types";

/**
 * Nitro error handler that forwards uncaught SSR errors to Sentry.
 *
 * Wired into Nitro via the `errorHandler` option in `vite.config.ts`. The
 * host app's `server/error.ts` file is a 2-line shim that re-exports this
 * default — Nitro resolves `errorHandler` as a filesystem path so the file
 * has to live inside the app's `server/` directory.
 */
const errorHandler: NitroErrorHandler = async (error) => {
  const cause = error.cause ?? error;
  const message =
    cause instanceof Error ? (cause.stack ?? cause.message) : cause;
  console.error(message);

  try {
    Sentry.captureException(cause);
    await Sentry.flush(2000);
  } catch {
    // Sentry SDK not initialized or unavailable
  }
};

export default errorHandler;
