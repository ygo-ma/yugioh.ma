import type { Plugin } from "vite";

interface BuildConfigOptions {
  sourcemap: "hidden" | false;
}

/**
 * Enables hidden sourcemaps when Sentry upload is configured.
 *
 * - Top-level `config()` sets the default for all environments.
 * - `configEnvironment()` re-applies the setting for server environments
 *   because Nitro overrides `build.sourcemap` to `false`.
 */
export function buildConfigPlugin({ sourcemap }: BuildConfigOptions): Plugin {
  return {
    name: "@acme/sentry/build-config",
    config: () => ({ build: { sourcemap } }),
    configEnvironment(name, config) {
      if (config.consumer === "server") {
        config.build ??= {};
        // SSR is intermediate (consumed by Nitro, never served). Use
        // non-hidden maps so Rolldown can read the sourceMappingURL
        // and chain through to the original source files.
        config.build.sourcemap = name === "ssr" && sourcemap ? true : sourcemap;
      }
    },
  };
}
