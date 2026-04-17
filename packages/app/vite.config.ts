import { sentryPlugin } from "@acme/sentry/vite";
import { acmeServer } from "@acme/server/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({ srcDirectory: "src" }),
    viteReact(),
    acmeServer({
      baseDir: "./src/server",
      apps: ["api", "media"],
      middlewareDir: "middleware",
    }),
    sentryPlugin(),
  ],
});
