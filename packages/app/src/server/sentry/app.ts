import {
  createSentryHonoErrorHandler,
  sentryTunnelRoute,
} from "@acme/sentry/hono";
import { Hono } from "hono";
import type { AppEnv } from "../types";

export default new Hono<AppEnv>()
  .onError(createSentryHonoErrorHandler())
  .basePath("/sentry")
  .route("/", sentryTunnelRoute);
