import { getRuntimeKey } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Database } from "./types";
import * as schema from "./schema";

let cachedDb: Database | null = null;

async function resolveDatabase(env: AppEnv["Bindings"]): Promise<Database> {
  // On Cloudflare Workers/Pages without a D1 binding, there's no way to
  // connect to a database — SQLite/libsql require a Node.js environment.
  if (getRuntimeKey() === "workerd") {
    if (!env.DB) {
      throw new Error(
        "No database configured: set a D1 binding (env.DB) or run in a Node.js environment with DATABASE_URL",
      );
    }

    // D1 is available (Cloudflare Workers/Pages with a D1 binding)
    const { drizzle } = await import("drizzle-orm/d1");
    return drizzle(env.DB, { schema });
  }

  // Resolve the right sqlite-based database on Node.js and cache it
  if (!cachedDb) {
    const { resolveSqlite } = await import("./sqlite");
    cachedDb = await resolveSqlite(process.env.DATABASE_URL);
  }

  return cachedDb;
}

export const dbMiddleware = createMiddleware<AppEnv>(async (context, next) => {
  context.set("db", await resolveDatabase(context.env));
  await next();
});
