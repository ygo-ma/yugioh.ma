import type { Database } from "./types";

export async function resolveSqlite<TSchema extends Record<string, unknown>>(
  url: string | undefined,
  schema: TSchema,
): Promise<Database<TSchema>> {
  const databaseUrl = url ?? "file:sqlite.db";
  const { drizzle } = await import("drizzle-orm/libsql");
  return drizzle(databaseUrl, { schema });
}
