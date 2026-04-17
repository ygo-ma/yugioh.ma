import { resolve } from "node:path";
import { resolveDbUrl, seed } from ".";

const url = resolveDbUrl(process.env.DATABASE_URL);
const path = resolve(import.meta.dirname, "seed.sql");

await seed(url, path);
