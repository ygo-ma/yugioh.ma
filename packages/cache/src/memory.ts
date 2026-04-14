import type { Cache } from "./types";

interface Entry {
  value: string;
  expiresAt?: number;
}

export function createMemoryCache(): Cache {
  const store = new Map<string, Entry>();

  return {
    // oxlint-disable-next-line typescript/require-await
    async get(key) {
      const entry = store.get(key);
      if (!entry) {
        return;
      }

      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return;
      }

      return entry.value;
    },
    // oxlint-disable-next-line typescript/require-await
    async set(key, value, ttl) {
      const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    // oxlint-disable-next-line typescript/require-await
    async delete(key) {
      store.delete(key);
    },
  };
}
