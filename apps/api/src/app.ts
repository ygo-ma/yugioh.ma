import { Hono } from "hono";
import type { AppEnv } from "./db/types";
import { dbMiddleware } from "./db/index";
import { posts } from "./db/schema";

const app = new Hono<AppEnv>().basePath("/api");

export default app
  .use(dbMiddleware)
  .get("/health", (context) => context.json({ status: "ok" }))
  .get("/posts", async (context) => {
    const db = context.var.db;
    const allPosts = await db.select().from(posts);
    return context.json(allPosts);
  });
