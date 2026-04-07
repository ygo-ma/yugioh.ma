import { sentryVitePlugin } from "@sentry/vite-plugin";
import type { PluginOption } from "vite";

/**
 * All-in-one Sentry Vite integration. Bundles three things together so the
 * host app's `vite.config.ts` only needs a single plugin entry:
 *
 * 1. An env-bridge side effect that copies the backend `SENTRY_*` vars into
 *    `VITE_SENTRY_*` keys so the client SDK init in `@acme/sentry/client`
 *    can read them via `import.meta.env`.
 * 2. A small config plugin that flips `build.sourcemap` to `"hidden"` only
 *    when an upload token is present (otherwise `false` — no sourcemap files).
 * 3. The official `sentryVitePlugin` configured from the standard env vars
 *    (org, project, auth token, release, dist, source-map cleanup).
 *
 * Drop it into your Vite plugins array — Vite flattens the nested
 * `PluginOption` array transparently, so no spread is required:
 *
 * ```ts
 * import { sentryPlugin } from "@acme/sentry/vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     // ... other plugins
 *     sentryPlugin(),
 *   ],
 * });
 * ```
 */
export function sentryPlugin(): PluginOption {
  const env = process.env;

  // Bridge backend env vars → client-visible VITE_SENTRY_* keys at load time
  // so Vite can statically replace `import.meta.env` references in browser code.
  env.VITE_SENTRY_ENABLED = env.SENTRY_DSN;
  env.VITE_SENTRY_ENVIRONMENT = env.SENTRY_ENVIRONMENT;
  env.VITE_SENTRY_RELEASE = env.SENTRY_RELEASE;
  env.VITE_SENTRY_DIST = env.SENTRY_DIST;

  return [
    {
      name: "@acme/sentry/build-config",
      config() {
        return {
          build: {
            // Hidden sourcemaps so they can be uploaded to Sentry but never
            // referenced from production JS via `//# sourceMappingURL`.
            sourcemap: env.SENTRY_AUTH_TOKEN ? ("hidden" as const) : false,
          },
        };
      },
    },
    sentryVitePlugin({
      org: env.SENTRY_ORG,
      project: env.SENTRY_PROJECT,
      authToken: env.SENTRY_AUTH_TOKEN,
      release: {
        name: env.SENTRY_RELEASE,
        dist: env.SENTRY_DIST,
        setCommits: { auto: true },
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
      disable: !env.SENTRY_AUTH_TOKEN,
    }),
  ];
}
