import type { D1Database } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import type { Database, Schema } from "./types";

interface ResolveDatabaseOptions<TSchema extends Schema> {
  d1?: D1Database;
  url: string | (() => string);
  schema: TSchema;
}

export async function resolveDatabase<TSchema extends Schema>({
  d1,
  url,
  schema,
}: ResolveDatabaseOptions<TSchema>): Promise<Database<TSchema>> {
  if (getRuntimeKey() === "workerd") {
    if (!d1) {
      throw new Error("Please add a D1 binding named 'DB'");
    }

    const { drizzle } = await import("drizzle-orm/d1");
    return drizzle(d1, { schema });
  }

  const { drizzle } = await import("drizzle-orm/libsql");
  return drizzle(typeof url === "function" ? url() : url, { schema });
}
