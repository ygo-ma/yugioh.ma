import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { resolveSqlite } from "./sqlite";

const seedPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "seed.sql",
);

const db = await resolveSqlite(process.env.DATABASE_URL);
const seedSql = readFileSync(seedPath, "utf-8");
await db.run(sql.raw(seedSql));
