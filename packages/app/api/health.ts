import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../server/types";
import { resolveDatabase } from "../db";
import { resolveStorage } from "../storage";
import { BUCKET_NAMES } from "../storage/buckets";

async function checkDatabase(env: AppEnv["Bindings"]): Promise<void> {
  try {
    const db = await resolveDatabase(env);
    await db.run(sql`SELECT 1`);
  } catch {
    throw new HTTPException(503, { message: "database error" });
  }
}

async function checkStorage(env: AppEnv["Bindings"]): Promise<void> {
  try {
    const buckets = await resolveStorage(env);
    await Promise.all(
      // hasItem maps to HeadObject (Class B on R2)
      BUCKET_NAMES.map((name) => buckets[name].hasItem("_health")),
    );
  } catch {
    throw new HTTPException(503, { message: "storage error" });
  }
}

const health = new Hono<AppEnv>();

export default health.get("/", async (context) => {
  await Promise.all([checkDatabase(context.env), checkStorage(context.env)]);
  return context.json({ status: "ok" });
});
