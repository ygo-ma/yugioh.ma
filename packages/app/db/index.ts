import { createDbMiddleware } from "@acme/db/middleware";
import {
  resolveDatabase as resolve,
  type Database as GenericDb,
} from "@acme/db";
import type { DbBindings } from "@acme/db";
import * as schema from "./schema";

export type Database = GenericDb<typeof schema>;

export async function resolveDatabase(env: DbBindings): Promise<Database> {
  return resolve(env, schema);
}

export const dbMiddleware = createDbMiddleware(schema);
