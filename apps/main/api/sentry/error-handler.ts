import * as Sentry from "@sentry/cloudflare";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../../db/types";

const sentryErrorHandler: ErrorHandler<AppEnv> = (error, context) => {
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

export default sentryErrorHandler;
