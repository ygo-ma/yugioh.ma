import type { D1Database } from "@cloudflare/workers-types";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

export type Database = BaseSQLiteDatabase<
  "sync" | "async",
  unknown,
  typeof schema
>;

export interface CfBindings {
  DB?: D1Database;
  BASIC_AUTH_CREDENTIALS?: string;
}

export interface AppEnv {
  Bindings: CfBindings;
  Variables: {
    db: Database;
  };
}
