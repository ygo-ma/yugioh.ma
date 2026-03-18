import { defineEventHandler, HTTPError } from "nitro/h3";
import { sql } from "drizzle-orm";
import { cachedDb, resolveDatabase } from "../db/index";

export default defineEventHandler(async (event) => {
  const env = event.runtime?.cloudflare?.env ?? {};
  try {
    const db = cachedDb ?? (await resolveDatabase(env));
    await db.run(sql`SELECT 1`);
  } catch {
    throw HTTPError.status(503, "db unreachable");
  }
  return { status: "ok" };
});
