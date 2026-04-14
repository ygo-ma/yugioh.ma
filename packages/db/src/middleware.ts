import { createMiddleware } from "hono/factory";
import { resolveDatabase } from "./resolve";
import type { DbBindings, Database } from "./types";

export function createDbMiddleware<TSchema extends Record<string, unknown>>(
  schema: TSchema,
) {
  let cachedDb: Database<TSchema> | null = null;

  return createMiddleware<{
    Bindings: DbBindings;
    Variables: { db: Database<TSchema> };
  }>(async (context, next) => {
    cachedDb ??= await resolveDatabase(context.env, schema);
    context.set("db", cachedDb);
    await next();
  });
}
