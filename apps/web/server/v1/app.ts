import { Hono } from "hono";
import type { AppEnv } from "../db/types";
import { dbMiddleware } from "../db/index";
import { posts } from "../db/schema";

const app = new Hono<AppEnv>().basePath("/api/v1");

export default app
  .use(dbMiddleware)
  .get("/posts", async (context) => {
    const db = context.var.db;
    const allPosts = await db.select().from(posts);
    return context.json(allPosts);
  })
  .post("/posts", async (context) => {
    const body = await context.req.json<{ title: string; content: string }>();
    const db = context.var.db;
    const result = await db
      .insert(posts)
      .values({
        title: body.title,
        content: body.content,
      })
      .returning();
    return context.json(result[0], 201);
  });
