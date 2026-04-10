import { defineEventHandler } from "nitro/h3";
import { createEnvProxy } from "../env";
import type { EnvVars } from "../types";

export default defineEventHandler((event) => {
  const cfEnv = (event.runtime?.cloudflare?.env ?? {}) as EnvVars;
  event.context.env = createEnvProxy(cfEnv);
});
