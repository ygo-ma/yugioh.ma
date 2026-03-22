import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const env = process.env;

// Match the backend's environment variables
env.VITE_SENTRY_ENABLED = env.SENTRY_DSN;
env.VITE_SENTRY_ENVIRONMENT = env.SENTRY_ENVIRONMENT;
env.VITE_SENTRY_RELEASE = env.SENTRY_RELEASE;
env.VITE_SENTRY_DIST = env.SENTRY_DIST;

export default defineConfig({
  build: {
    sourcemap: env.SENTRY_AUTH_TOKEN ? "hidden" : false,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({ srcDirectory: "web" }),
    viteReact(),
    nitro({
      serverDir: "./server",
      errorHandler: "./server/error.ts",
    }),
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
  ],
});
