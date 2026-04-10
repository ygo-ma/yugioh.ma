import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Database } from "./types";
import * as schema from "./schema";

const defaultPath = resolve(import.meta.dirname, "..", "sqlite.db");

export async function resolveSqlite(url?: string): Promise<Database> {
  const databaseUrl = url ?? pathToFileURL(defaultPath).toString();
  const { drizzle } = await import("drizzle-orm/libsql");
  return drizzle(databaseUrl, { schema });
}
