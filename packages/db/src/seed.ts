import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { Database } from "./types";

export async function runSeed(db: Database, path: string) {
  const seedSql = await readFile(path, "utf-8");
  await db.run(sql.raw(seedSql));
}
