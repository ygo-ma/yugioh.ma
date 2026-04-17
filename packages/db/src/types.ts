import type { D1Database } from "@cloudflare/workers-types";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

export type Schema = Record<string, unknown>;

export type Database<TSchema extends Schema = Schema> = BaseSQLiteDatabase<
  "sync" | "async",
  unknown,
  TSchema
>;

export interface DbBindings {
  DB?: D1Database;
}
