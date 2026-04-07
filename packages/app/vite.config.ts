import { sentryPlugin } from "@acme/sentry/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
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
    sentryPlugin(),
  ],
});
