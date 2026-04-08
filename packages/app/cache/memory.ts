import type { Cache } from "./types";

interface Entry {
  value: string;
  expiresAt?: number;
}

export function createMemoryCache(): Cache {
  const store = new Map<string, Entry>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(entry.value);
    },
    set(key, value, ttl) {
      store.set(key, {
        value,
        expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
      });
      return Promise.resolve();
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
  };
}
