import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { CfBindings } from "../server/types";
import type * as schema from "./schema";

export type { CfBindings };

export type Database = BaseSQLiteDatabase<
  "sync" | "async",
  unknown,
  typeof schema
>;

export interface AppEnv {
  Bindings: CfBindings;
  Variables: {
    db: Database;
  };
}
