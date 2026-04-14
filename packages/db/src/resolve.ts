import { getRuntimeKey } from "hono/adapter";
import type { DbBindings, Database } from "./types";

export async function resolveDatabase<TSchema extends Record<string, unknown>>(
  env: DbBindings,
  schema: TSchema,
): Promise<Database<TSchema>> {
  if (getRuntimeKey() === "workerd") {
    if (!env.DB) {
      throw new Error("Please add a D1 binding named 'DB'");
    }

    const { drizzle } = await import("drizzle-orm/d1");
    return drizzle(env.DB, { schema });
  }

  const { resolveSqlite } = await import("./sqlite");
  return resolveSqlite(env.DATABASE_URL, schema);
}
