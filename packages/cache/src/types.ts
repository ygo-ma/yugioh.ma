import type { KVNamespace } from "@cloudflare/workers-types";

export interface Cache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CacheBindings {
  CACHE?: KVNamespace;
  CACHE_URL?: string;
}
