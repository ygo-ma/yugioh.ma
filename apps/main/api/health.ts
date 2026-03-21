import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../db/types";
import { resolveDatabase } from "../db";

const health = new Hono<AppEnv>();

export default health.get("/", async (context) => {
  try {
    const db = await resolveDatabase(context.env);
    await db.run(sql`SELECT 1`);
  } catch {
    throw new HTTPException(503, { message: "db unreachable" });
  }
  return context.json({ status: "ok" });
});
