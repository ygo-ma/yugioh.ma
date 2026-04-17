import { createMiddleware } from "hono/factory";
import { resolveDatabase } from "./resolve";
import type { Database, DbBindings, Schema } from "./types";

export type { Database, DbBindings } from "./types";

interface DbKitConfig<TEnv, TSchema extends Schema> {
  schema: TSchema;
  databaseUrl: (env: TEnv) => string | undefined;
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
      const url = databaseUrl(env);
      dbPromise = resolveDatabase({ d1: env.DB, url, schema });
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

  const seed = async (path: string) => {
    const url = databaseUrl(process.env as unknown as TEnv);
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
