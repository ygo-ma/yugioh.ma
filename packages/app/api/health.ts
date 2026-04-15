import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { resolveCache } from "@acme/cache";
import { resolveDatabase } from "../db";
import type { AppEnv } from "../server/types";
import { resolveStorage } from "../storage";

async function checkDatabase(env: AppEnv["Bindings"]) {
  try {
    const db = await resolveDatabase(env);
    await db.run(sql`SELECT 1`);
  } catch {
    throw new HTTPException(503, { message: "db unreachable" });
  }
}

async function checkCache(env: AppEnv["Bindings"]) {
  try {
    const cache = await resolveCache(env);
    await cache.set("__health__", "1", 60);
    await cache.get("__health__");
  } catch {
    throw new HTTPException(503, { message: "cache unreachable" });
  }
}

async function checkStorage(env: AppEnv["Bindings"]) {
  try {
    const buckets = await resolveStorage(env);
    await Promise.all(
      // hasItem maps to HeadObject (Class B on R2)
      Object.values(buckets).map((bucket) => bucket.hasItem("_health")),
    );
  } catch {
    throw new HTTPException(503, { message: "storage unreachable" });
  }
}

const health = new Hono<AppEnv>();

export default health.get("/", async (context) => {
  await Promise.all([
    checkDatabase(context.env),
    checkCache(context.env),
    checkStorage(context.env),
  ]);
  return context.json({ status: "ok" });
});
