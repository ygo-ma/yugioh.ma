import { Hono } from "hono";
import type { AppEnv } from "../db/types";
import health from "./health";
import sentryErrorHandler from "./sentry/error-handler";
import sentryTunnel from "./sentry/tunnel";
import v1 from "./v1";

export default new Hono<AppEnv>()
  .onError(sentryErrorHandler)
  .basePath("/api")
  .route("/health", health)
  .route("/sentry", sentryTunnel)
  .route("/v1", v1);
