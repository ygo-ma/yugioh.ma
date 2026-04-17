import { createDbKit, type Database as GenericDb } from "@acme/db";
import type { EnvVars } from "../types";
import * as schema from "./schema";

export function resolveDbUrl(url: string | undefined): string {
  if (url) {
    return url;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Please setup a database URL");
  }

  // Non-production default (e.g. SQLite file)
  return "file:sqlite.db";
}

export type Database = GenericDb<typeof schema>;
export const { resolveDatabase, dbMiddleware, seed } = createDbKit({
  schema,
  databaseUrl: (env: EnvVars) => resolveDbUrl(env.DATABASE_URL),
});
