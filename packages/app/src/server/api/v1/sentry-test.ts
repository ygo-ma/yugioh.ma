import { Hono } from "hono";
import type { AppEnv } from "../../types";

const sentryTest = new Hono<AppEnv>();

export default sentryTest.get("/", () => {
  throw new Error("Sentry backend test error");
});
