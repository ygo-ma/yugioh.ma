import { sentryPlugin } from "@acme/sentry/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const NITRO_PRESET = process.env.NITRO_PRESET;
  const isCloudflarePreset = NITRO_PRESET?.startsWith("cloudflare") ?? false;

  return {
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tanstackStart({ srcDirectory: "web" }),
      viteReact(),
      nitro({
        serverDir: "./server",
        errorHandler: "./server/error.ts",
        rolldownConfig: {
          external: isCloudflarePreset
            ? ["iovalkey", "@libsql/client", "drizzle-orm/libsql"]
            : [],
        },
      }),
      sentryPlugin(),
    ],
  };
});
