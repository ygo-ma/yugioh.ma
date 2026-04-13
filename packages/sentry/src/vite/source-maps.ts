import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import remapping from "@jridgewell/remapping";
import type { SourceMapInput } from "@jridgewell/remapping";
import type { Plugin } from "vite";

/**
 * Composes multi-level source maps into flat maps before the Sentry
 * plugin uploads them.
 *
 * Nitro's build pipeline produces a two-level source map chain:
 *   Nitro chunks → SSR intermediate → original source
 * Sentry only resolves one level, so without composition it shows
 * the SSR intermediate code instead of the original `.tsx` files.
 *
 * This plugin runs in `writeBundle` with `enforce: "pre"` so it
 * rewrites the `.map` files before the Sentry plugin reads them.
 */
export function sourceMapsPlugin(): Plugin {
  return {
    name: "@acme/sentry/source-maps",
    enforce: "pre",
    writeBundle(options, bundle) {
      if (!options.dir) {
        return;
      }

      const dir = options.dir;

      for (const [filename, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk") {
          continue;
        }

        const mapPath = resolve(dir, filename + ".map");
        let raw: string;
        try {
          raw = readFileSync(mapPath, "utf8");
        } catch {
          continue;
        }

        const composed = remapping(raw, (source, _ctx) => {
          const sourceMap = resolve(dirname(mapPath), source + ".map");
          if (!existsSync(sourceMap)) {
            return null;
          }

          return JSON.parse(readFileSync(sourceMap, "utf8")) as SourceMapInput;
        });

        writeFileSync(mapPath, JSON.stringify(composed));
      }
    },
  };
}
