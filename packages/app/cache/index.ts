import { getRuntimeKey } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../db/types";
import type { Cache } from "./types";

export type { Cache } from "./types";

export async function resolveCache(env: AppEnv["Bindings"]): Promise<Cache> {
  // On Cloudflare Workers/Pages, use the KV namespace binding.
  if (getRuntimeKey() === "workerd") {
    if (!env.CACHE) throw new Error("Please add a KV binding named 'CACHE'");

    const { createCloudflareCache } = await import("./cloudflare");
    return createCloudflareCache(env.CACHE);
  }

  // On Node.js: use Valkey if CACHE_URL is set (docker compose), otherwise
  // fall back to an in-memory store (dev or single-container Docker).
  if (process.env.CACHE_URL) {
    const { createValkeyCache } = await import("./valkey");
    return createValkeyCache(process.env.CACHE_URL);
  }

  const { createMemoryCache } = await import("./memory");
  return createMemoryCache();
}

let cachedCache: Cache | null = null;
export const cacheMiddleware = createMiddleware<AppEnv>(
  async (context, next) => {
    cachedCache ??= await resolveCache(context.env);
    context.set("cache", cachedCache);
    await next();
  },
);
