import type { D1Database } from "@cloudflare/workers-types";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

export type Database<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> = BaseSQLiteDatabase<"sync" | "async", unknown, TSchema>;

export interface DbBindings {
  DB?: D1Database;
  DATABASE_URL?: string;
}
