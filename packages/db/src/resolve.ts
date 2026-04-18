import type { D1Database } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import { fileURLToPath } from "node:url";
import type { Database, Schema } from "./types";

interface ResolveDatabaseOptions<TSchema extends Schema> {
  d1?: D1Database;
  url: string | (() => string);
  schema: TSchema;
}

// WHATWG `file://` URLs go through Node's parser (percent-decoding,
// host handling, Windows drive letters). The relaxed forms libsql
// accepts (`file:sqlite.db`, `file:/abs/path`) aren't valid WHATWG
// file URLs, so we strip the scheme manually for those.
function toDatabasePath(url: string): string {
  if (url.startsWith("file://")) {
    return fileURLToPath(url);
  }

  return url.slice("file:".length);
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

  const resolved = typeof url === "function" ? url() : url;

  if (resolved.startsWith("file:")) {
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    return drizzle(toDatabasePath(resolved), { schema });
  }

  const { drizzle } = await import("drizzle-orm/libsql");
  return drizzle(resolved, { schema });
}
