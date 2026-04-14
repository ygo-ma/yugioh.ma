import { createMiddleware } from "hono/factory";
import { resolveCache } from "./resolve";
import type { Cache, CacheBindings } from "./types";

export function createCacheMiddleware() {
  let cachePromise: Promise<Cache> | null = null;

  return createMiddleware<{
    Bindings: CacheBindings;
    Variables: { cache: Cache };
  }>(async (context, next) => {
    cachePromise ??= resolveCache(context.env);
    context.set("cache", await cachePromise);
    await next();
  });
}
