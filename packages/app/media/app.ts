import { sentryHonoErrorHandler } from "@acme/sentry/api";
import { Hono } from "hono";
import type { AppEnv } from "../db/types";
import { storageMiddleware } from "../storage";
import privateBucket from "./private";
import publicBucket from "./public";

export default new Hono<AppEnv>()
  .onError(sentryHonoErrorHandler)
  .basePath("/media")
  .use(storageMiddleware)
  .route("/public", publicBucket)
  .route("/private", privateBucket);
