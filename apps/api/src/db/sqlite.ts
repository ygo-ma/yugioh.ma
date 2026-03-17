import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./types";
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
