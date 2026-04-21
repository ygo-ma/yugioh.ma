import { createSentryHonoErrorHandler } from "@acme/sentry/hono";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { resolveCache } from "../cache";
import { resolveDatabase } from "../db";
import { resolveStorage } from "../storage";
import type { AppEnv } from "../types";

async function checkDatabase(env: AppEnv["Bindings"]) {
  try {
    const db = await resolveDatabase(env);
    await db.run(sql`SELECT 1`);
  } catch (cause) {
    throw new HTTPException(503, { message: "db unreachable", cause });
  }
}

async function checkCache(env: AppEnv["Bindings"]) {
  try {
    const cache = await resolveCache(env);
    await cache.set("__health__", "1", 60);
    await cache.get("__health__");
  } catch (cause) {
    throw new HTTPException(503, { message: "cache unreachable", cause });
  }
}

async function checkStorage(env: AppEnv["Bindings"]) {
  try {
    const buckets = await resolveStorage(env);
    await Promise.all(
      Object.values(buckets).map((bucket) => bucket.has("_health")),
    );
  } catch (cause) {
    throw new HTTPException(503, { message: "storage unreachable", cause });
  }
}

const health = new Hono<AppEnv>()
  // CI's post-deploy probe races bindings initialization; silence its
  // warmup 5xx so Sentry only sees real outages (non-CI callers).
  .onError(
    createSentryHonoErrorHandler({
      ignoreUserAgent: "acme-ci-health-probe",
    }),
  )
  .basePath("/health")
  .get("/", async (context) => {
    await Promise.all([
      checkDatabase(context.env),
      checkCache(context.env),
      checkStorage(context.env),
    ]);
    return context.json({ status: "ok" });
  });

export default health;
