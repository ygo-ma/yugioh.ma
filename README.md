# Acme

Full-stack template: Bun + TanStack Start + Hono + Drizzle + Cloudflare Pages.

## Quick Start

```sh
bun install
bun dev
```

The app runs at `http://localhost:3000` with the API at `/api/*`.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full layout, design decisions, and deployment targets.

## Customizing

Replace all instances of `@acme` and `acme` with your project name. Files to update:

- `package.json` (root + `packages/app` + `packages/tsconfig`)
- `packages/app/tsconfig.bun.json` and `tsconfig.react.json`
- `packages/app/wrangler.json`
- `.devcontainer/compose.yaml` and `devcontainer.json`
- `.github/workflows/*.yml`
