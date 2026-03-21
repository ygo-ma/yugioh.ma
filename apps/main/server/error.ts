import * as Sentry from "@sentry/cloudflare";
import type { NitroErrorHandler } from "nitro/types";

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
