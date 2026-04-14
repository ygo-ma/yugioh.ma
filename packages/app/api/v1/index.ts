import { Hono } from "hono";
import { createCacheMiddleware } from "@acme/cache/middleware";
import type { AppEnv } from "../../server/types";
import { dbMiddleware } from "../../db";
import { storageMiddleware } from "../../storage";
import postsRouter from "./posts";
import sentryTest from "./sentry-test";
import testUpload from "./test-upload";

const v1 = new Hono<AppEnv>();

export default v1
  .use(dbMiddleware)
  .use(createCacheMiddleware())
  .use(storageMiddleware)
  .route("/posts", postsRouter)
  .route("/sentry-test", sentryTest)
  .route("/test-upload", testUpload);
