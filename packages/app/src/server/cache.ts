import { createCacheKit } from "@acme/cache";
import type { EnvVars } from "./types";

export const { resolveCache, cacheMiddleware } = createCacheKit({
  cacheUrl: (env: EnvVars) => env.CACHE_URL,
});
