import { sentryHonoErrorHandler, sentryTunnelRoute } from "@acme/sentry/hono";
import { Hono } from "hono";
import type { AppEnv } from "../types";

export default new Hono<AppEnv>()
  .onError(sentryHonoErrorHandler)
  .basePath("/sentry")
  .route("/", sentryTunnelRoute);
