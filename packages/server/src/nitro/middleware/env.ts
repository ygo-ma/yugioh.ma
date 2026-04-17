import { defineEventHandler } from "nitro/h3";
import { createEnvProxy } from "../../env";

export default defineEventHandler((event) => {
  const cfEnv = event.runtime?.cloudflare?.env ?? {};
  (event.context as Record<string, unknown>).env = createEnvProxy(cfEnv);
});
