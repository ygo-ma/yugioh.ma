import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Database } from "./types";
import * as schema from "./schema";

export async function resolveSqlite(databaseUrl?: string): Promise<Database> {
  // Connect to a remote SQLite database
  if (databaseUrl && !databaseUrl.startsWith("file:")) {
    const { drizzle } = await import("drizzle-orm/libsql");
    return drizzle(databaseUrl, { schema });
  }

  // Fall back to a local SQLite database file
  const dbPath = databaseUrl
    ? fileURLToPath(new URL(databaseUrl))
    : resolve(dirname(fileURLToPath(import.meta.url)), "../..", "sqlite.db");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  return drizzle(dbPath, { schema });
}

let cachedDb: Database | null = null;

async function resolveDatabase(env: AppEnv["Bindings"]): Promise<Database> {
  console.log("DB Binding", env.DB);

  // D1 is available (Cloudflare Workers/Pages with a D1 binding)
  if (env.DB) {
    const { drizzle } = await import("drizzle-orm/d1");
    return drizzle(env.DB, { schema });
  }

  // On Cloudflare Workers/Pages without nodejs_compat, `process` is undefined.
  // If we reach here, it means no D1 binding was provided (env.DB) and we're
  // not running in Node.js — there's no way to connect to a database.
  if (typeof process === "undefined") {
    // oxlint-disable-next-line unicorn/prefer-type-error
    throw new Error(
      "No database configured: set a D1 binding (env.DB) or run in a Node.js environment with DATABASE_URL",
    );
  }

  cachedDb ??= await resolveSqlite();
  return cachedDb;
}

export const dbMiddleware = createMiddleware<AppEnv>(async (context, next) => {
  context.set("db", await resolveDatabase(context.env));
  await next();
});
