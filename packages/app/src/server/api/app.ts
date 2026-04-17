import { createSentryHonoErrorHandler } from "@acme/sentry/hono";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import v1 from "./v1";

export default new Hono<AppEnv>()
  .onError(createSentryHonoErrorHandler())
  .basePath("/api")
  .route("/v1", v1);
