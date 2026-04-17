import type { KVNamespace } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import type { Cache } from "./types";

interface ResolveCacheOptions {
  kv?: KVNamespace;
  url?: string;
}

export async function resolveCache({
  kv,
  url,
}: ResolveCacheOptions): Promise<Cache> {
  if (getRuntimeKey() === "workerd") {
    if (!kv) {
      throw new Error("Please add a KV binding named 'CACHE'");
    }

    const { createCloudflareCache } = await import("./cloudflare");
    return createCloudflareCache(kv);
  }

  if (url) {
    const { createValkeyCache } = await import("./valkey");
    return createValkeyCache(url);
  }

  const { createMemoryCache } = await import("./memory");
  return createMemoryCache();
}
