import { defineEventHandler } from "nitro/h3";
import type { EnvVars } from "../types";

export default defineEventHandler((event) => {
  const cfEnv = (event.runtime?.cloudflare?.env ?? {}) as EnvVars;
  event.context.env = new Proxy(cfEnv, {
    get: (target, key, receiver) =>
      // eslint-disable-next-line typescript-eslint/no-unsafe-return, typescript-eslint/prefer-nullish-coalescing -- empty strings in CF bindings should fall through to process.env
      typeof key === "symbol"
        ? Reflect.get(target, key, receiver)
        : (Reflect.get(target, key, receiver) ?? process.env[key]),
  });
});
