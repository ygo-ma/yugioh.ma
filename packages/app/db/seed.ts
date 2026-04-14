import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { resolveSqlite } from "@acme/db";
import * as schema from "./schema";

const seedPath = resolve(import.meta.dirname, "..", "seed.sql");

const db = await resolveSqlite(process.env.DATABASE_URL, schema);
const seedSql = readFileSync(seedPath, "utf-8");
await db.run(sql.raw(seedSql));
