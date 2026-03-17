import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./types";
import * as schema from "./schema";

export async function resolveSqlite(url?: string): Promise<Database> {
  const databaseUrl =
    url ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../..", "sqlite.db");

  // Connect to a remote SQLite database
  if (databaseUrl.startsWith("file:")) {
    const { drizzle } = await import("drizzle-orm/libsql");
    return drizzle(databaseUrl, { schema });
  }

  // Fall back to a local SQLite database file
  const dbPath = fileURLToPath(new URL(databaseUrl));
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  return drizzle(dbPath, { schema });
}
