import { getRuntimeKey } from "hono/adapter";
import type { Cache, CacheBindings } from "./types";

export async function resolveCache(env: CacheBindings): Promise<Cache> {
  // On Cloudflare Workers/Pages, use the KV namespace binding.
  if (getRuntimeKey() === "workerd") {
    if (!env.CACHE) {
      throw new Error("Please add a KV binding named 'CACHE'");
    }

    const { createCloudflareCache } = await import("./cloudflare");
    return createCloudflareCache(env.CACHE);
  }

  // On Node.js: use Valkey if CACHE_URL is set (docker compose), otherwise
  // fall back to an in-memory store (dev or single-container Docker).
  if (env.CACHE_URL) {
    const { createValkeyCache } = await import("./valkey");
    return createValkeyCache(env.CACHE_URL);
  }

  const { createMemoryCache } = await import("./memory");
  return createMemoryCache();
}
