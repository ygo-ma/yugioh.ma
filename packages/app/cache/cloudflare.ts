import type { KVNamespace } from "@cloudflare/workers-types";
import type { Cache } from "./types";

export function createCloudflareCache(kv: KVNamespace): Cache {
  return {
    async get(key) {
      return (await kv.get(key)) ?? undefined;
    },
    async set(key, value, ttl) {
      await kv.put(key, value, ttl ? { expirationTtl: ttl } : undefined);
    },
    async delete(key) {
      await kv.delete(key);
    },
  };
}
