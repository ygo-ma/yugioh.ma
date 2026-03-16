import { createMiddleware } from "hono/factory";
import type { AppEnv, Database } from "./types";
import * as schema from "./schema";

let cachedDb: Database | null = null;

async function resolveDatabase(env: AppEnv["Bindings"]): Promise<Database> {
  if (env.DB) {
    const { drizzle } = await import("drizzle-orm/d1");
    return drizzle(env.DB, { schema });
  }

  if (cachedDb !== null) return cachedDb;

  const databaseUrl =
    typeof process === "undefined" ? null : (process.env.DATABASE_URL ?? null);

  if (databaseUrl !== null && databaseUrl !== "") {
    const { drizzle } = await import("drizzle-orm/libsql");
    cachedDb = drizzle(databaseUrl, { schema });
    return cachedDb;
  }

  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  cachedDb = drizzle("sqlite.db", { schema });
  return cachedDb;
}

export const dbMiddleware = createMiddleware<AppEnv>(async (context, next) => {
  const db = await resolveDatabase(context.env);
  context.set("db", db);
  await next();
});
