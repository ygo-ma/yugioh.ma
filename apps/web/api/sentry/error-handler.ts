import * as Sentry from "@sentry/cloudflare";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../db/types";

const sentryErrorHandler: ErrorHandler<AppEnv> = (error, context) => {
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

export default sentryErrorHandler;
