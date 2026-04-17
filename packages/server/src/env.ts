/**
 * Wraps a CF Workers bindings object in a Proxy that falls back to
 * `process.env` per-key. On CF Workers the bindings object is always
 * defined, so a whole-object `cfEnv ?? process.env` fallback would never
 * reach `process.env` — even for keys that aren't configured as bindings.
 */
export function createEnvProxy<Env extends object>(bindings: Env): Env {
  return new Proxy(bindings, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;

      if (typeof key === "symbol") {
        return value;
      }

      return value ?? process.env[key];
    },
  });
}
