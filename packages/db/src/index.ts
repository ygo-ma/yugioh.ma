import { createMiddleware } from "hono/factory";
import { resolveDatabase } from "./resolve";
import type { Database, DbBindings, Schema } from "./types";

export type { Database, DbBindings } from "./types";

interface DbKitConfig<TEnv, TSchema extends Schema> {
  schema: TSchema;
  databaseUrl: (env: TEnv) => string;
}

export function createDbKit<TEnv, TSchema extends Schema>({
  schema,
  databaseUrl,
}: DbKitConfig<TEnv, TSchema>) {
  let dbPromise: Promise<Database<TSchema>> | null = null;
  const cachedResolve = async (env: TEnv & DbBindings) => {
    if (dbPromise) {
      return dbPromise;
    }

    try {
      dbPromise = resolveDatabase({
        d1: env.DB,
        url: () => databaseUrl(env),
        schema,
      });
      return await dbPromise;
    } catch (error) {
      dbPromise = null;
      throw error;
    }
  };

  const dbMiddleware = createMiddleware<{
    Bindings: TEnv & DbBindings;
    Variables: { db: Database<TSchema> };
  }>(async (context, next) => {
    context.set("db", await cachedResolve(context.env));
    await next();
  });

  const seed = async (url: string, path: string) => {
    const db = await resolveDatabase({ url, schema });
    // Dynamic: keeps node:fs out of the CF worker bundle.
    const { runSeed } = await import("./seed");
    await runSeed(db, path);
  };

  return {
    resolveDatabase: cachedResolve,
    dbMiddleware,
    seed,
  };
}
