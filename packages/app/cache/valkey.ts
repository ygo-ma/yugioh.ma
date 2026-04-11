import type { Cache } from "./types";

export async function createValkeyCache(url: string): Promise<Cache> {
  const { default: Valkey } = await import("iovalkey");
  const client = new Valkey(url);

  return {
    async get(key) {
      return (await client.get(key)) ?? undefined;
    },
    async set(key, value, ttl) {
      if (ttl) await client.set(key, value, "EX", ttl);
      else await client.set(key, value);
    },
    async delete(key) {
      await client.del(key);
    },
  };
}
