import { getRuntimeKey } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Database } from "./types";
import * as schema from "./schema";

export async function resolveDatabase(
  env: AppEnv["Bindings"],
): Promise<Database> {
  // On Cloudflare Workers/Pages without a D1 binding, there's no way to
  // connect to a database — SQLite/libsql require a Node.js environment.
  if (getRuntimeKey() === "workerd") {
    if (!env.DB) throw new Error("Please add a D1 binding named 'DB'");

    const { drizzle } = await import("drizzle-orm/d1");
    return drizzle(env.DB, { schema });
  }

  // Resolve the right sqlite-based database on Node.js
  const { resolveSqlite } = await import("./sqlite");
  return resolveSqlite(process.env.DATABASE_URL);
}

let cachedDb: Database | null = null;
export const dbMiddleware = createMiddleware<AppEnv>(async (context, next) => {
  cachedDb ??= await resolveDatabase(context.env);
  context.set("db", cachedDb);
  await next();
});
