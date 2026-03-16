import * as schema from "./schema";
import { resolveSqlite } from ".";

const db = await resolveSqlite(process.env.DATABASE_URL);

db.insert(schema.posts)
  .values([
    { title: "Hello World", content: "This is the first post." },
    {
      title: "Getting Started",
      content: "A guide to getting started with the app.",
    },
    {
      title: "Database Abstraction",
      content: "How we support D1, libsql, and better-sqlite3.",
    },
  ])
  .run();
