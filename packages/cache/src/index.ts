import { createMiddleware } from "hono/factory";
import { resolveCache } from "./resolve";
import type { Cache, CacheBindings } from "./types";

export type { Cache, CacheBindings } from "./types";

interface CacheKitConfig<TEnv> {
  cacheUrl: (env: TEnv) => string | undefined;
}

export function createCacheKit<TEnv>({ cacheUrl }: CacheKitConfig<TEnv>) {
  let cachePromise: Promise<Cache> | null = null;
  const cachedResolve = async (env: TEnv & CacheBindings) => {
    if (cachePromise) {
      return cachePromise;
    }

    try {
      cachePromise = resolveCache({ kv: env.CACHE, url: cacheUrl(env) });
      return await cachePromise;
    } catch (error) {
      cachePromise = null;
      throw error;
    }
  };

  const cacheMiddleware = createMiddleware<{
    Bindings: TEnv & CacheBindings;
    Variables: { cache: Cache };
  }>(async (context, next) => {
    context.set("cache", await cachedResolve(context.env));
    await next();
  });

  return { resolveCache: cachedResolve, cacheMiddleware };
}
