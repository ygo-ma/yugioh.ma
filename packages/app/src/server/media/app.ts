import { createSentryHonoErrorHandler } from "@acme/sentry/hono";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { createMediaRoute } from "../storage";

const media = new Hono<AppEnv>()
  .onError(createSentryHonoErrorHandler())
  .route("/media", createMediaRoute());

export default media;
