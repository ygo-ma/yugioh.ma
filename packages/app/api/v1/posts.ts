import { captureHandledError } from "@acme/sentry/api";
import { createSelectSchema } from "drizzle-zod";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../server/types";
import { posts } from "../../db/schema";

const CACHE_KEY = "posts:all";
const CACHE_TTL = 60;

// `createdAt` is a `mode: "timestamp"` column, so drizzle returns it as a
// `Date` and `createSelectSchema` types it as `z.date()`. JSON round-trips
// turn the Date into an ISO string, which `z.date()` would reject — coerce
// it back when validating cached values.
const cacheSchema = z.array(
  createSelectSchema(posts).extend({
    createdAt: z.coerce.date(),
  }),
);

const postsRouter = new Hono<AppEnv>();

export default postsRouter
  .get("/", async (context) => {
    const cache = context.var.cache;
    const cached = await cache.get(CACHE_KEY);
    if (cached !== null) {
      try {
        const parsed = cacheSchema.parse(JSON.parse(cached));
        context.header("X-Cache", "HIT");
        return context.json(parsed);
      } catch (error) {
        captureHandledError(context, error);
      }
    }

    const db = context.var.db;
    const allPosts = await db.select().from(posts);
    await cache.set(CACHE_KEY, JSON.stringify(allPosts), CACHE_TTL);

    context.header("X-Cache", "MISS");
    return context.json(allPosts);
  })
  .post("/", async (context) => {
    const body = await context.req.json<{ title: string; content: string }>();
    const db = context.var.db;
    const result = await db
      .insert(posts)
      .values({
        title: body.title,
        content: body.content,
      })
      .returning();
    await context.var.cache.delete(CACHE_KEY);
    return context.json(result[0], 201);
  });
