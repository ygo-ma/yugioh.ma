# Architecture

## Stack

Bun monorepo with TanStack Start (SSR + SPA), Hono API, Drizzle ORM, and Nitro as the server layer. Cloudflare Pages for deployment, with Docker as an alternative target. All packages live under `packages/`.

## Directory Layout

```
packages/
  app/                    # The full-stack application
    api/                  # Hono API routes
      app.ts              # Root Hono app — mounts health, sentry tunnel, v1
      health.ts           # GET /api/health (DB connectivity check)
      v1/                 # Versioned API sub-app
      sentry/             # Error handler + client envelope tunnel
    db/                   # Database layer (shared across api + server)
      index.ts            # resolveDatabase() + dbMiddleware
      schema.ts           # Drizzle table definitions
      sqlite.ts           # libsql driver for Node.js/Docker
      types.ts            # Database & AppEnv type exports
      migrations/         # Drizzle-generated SQL migrations
    server/               # Nitro glue (SSR + middleware)
      api/[...].ts        # Catch-all that forwards /api/* to Hono
      middleware/          # Auth, Sentry SSR init
      error.ts            # Nitro error handler
    web/                  # TanStack Start frontend
      routes/             # File-based routing
      components/         # React components
      middleware/          # TanStack function middleware
      router.tsx          # Router init + client Sentry setup
      sentry.ts           # Client-side Sentry config
  tsconfig/               # Shared TypeScript configs
  ui/                     # (planned) Design tokens, CSS reset, component library
```

## How the API is Embedded

The Hono API doesn't run as a separate service. Nitro's catch-all route at `server/api/[...].ts` forwards all `/api/*` requests to `app.fetch()`. This means one deployment serves both SSR pages and API endpoints.

## Database Abstraction

The DB driver is resolved at request time based on the runtime:

- **Cloudflare (workerd)**: Uses D1 via `drizzle-orm/d1` from `env.DB`
- **Node.js / Docker**: Uses libsql via `@libsql/client` (supports both local `file:` paths and remote sqld URLs)
- **Dev**: Local SQLite at `./sqlite.db`

**Why runtime resolution?** A single codebase targets three deployment models without platform-specific code leaking into business logic. The Hono middleware (`dbMiddleware`) injects the resolved Drizzle instance into every request context via `c.set("db", ...)`, so handlers never know which driver they're using.

## Error Tracking (Sentry)

Sentry is initialized in three separate places. This is intentional — each runtime context has different error surfaces that a single integration cannot cover:

1. **API layer** (`api/sentry/error-handler.ts`): Hono `onError` handler. Captures unhandled errors from API route handlers, skips 4xx (client errors), and returns `{ error, sentryEventId }` for 5xx.

2. **SSR layer** (`server/middleware/sentry.ts` + `server/error.ts`): Nitro middleware initializes a `CloudflareClient` for server-side rendering errors. The Nitro error handler captures uncaught exceptions and flushes before responding.

3. **Client layer** (`web/sentry.ts`): `@sentry/react` with `ErrorBoundary` at the root. Uses a **dummy DSN** (`https://reporter@errors.internal/0`) — the real DSN never reaches the browser.

**Why a client tunnel?** The route at `/api/sentry` receives client-side Sentry envelopes, rewrites the dummy DSN header with the real server-side DSN, and forwards to Sentry's ingest endpoint. This prevents ad-blockers from dropping error reports and avoids exposing the DSN in client bundles.

**Deduplication**: TanStack function middleware marks server-thrown errors with a non-enumerable `CAPTURED` property. The client-side `beforeSend` filter drops these, preventing the same error from being reported twice (once server-side, once when hydrated client-side).

## Deployment

| Layer   | Cloudflare      | Docker (self-hosted)  | Dev / Standalone        |
| ------- | --------------- | --------------------- | ----------------------- |
| DB      | D1 (drizzle/d1) | sqld (drizzle/libsql) | SQLite (drizzle/libsql) |
| Cache   | KV              | Valkey                | In-memory               |
| Storage | R2 (unstorage)  | S3/MinIO (unstorage)  | Filesystem (unstorage)  |

Cache and storage layers are planned but not yet implemented. The DB layer demonstrates the pattern they will follow.

## CI/CD

Two workflows in `.github/workflows/`:

**`ci-checks-and-preview.yml`** (every PR + push to main):

1. Lint (oxfmt + oxlint + tsc)
2. Create/reuse a D1 database (per-branch for PRs, fixed for staging)
3. Run migrations + seed on first creation
4. Mutate `wrangler.json` with database ID + Sentry vars via `jq`
5. Build with `NITRO_PRESET=cloudflare-pages`
6. Deploy to Cloudflare Pages
7. Health check against `/api/health`

**`ci-cleanup-preview.yml`** (PR closed): Deletes the preview D1 database.

**Why per-branch D1?** Each PR gets an isolated database so preview deployments have real data without polluting staging. The branch name is slugified and used as a suffix for the database name.

## Conventions

- **SSR-first**: Pages work with JavaScript disabled. Native forms, Post-Redirect-Get.
- **CSS modules**: No Tailwind. Dark mode via `prefers-color-scheme`. Mobile-first, responsive to 240px.
- **Strict TypeScript**: `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noUnusedLocals`, etc.
- **Dependency catalog**: All versions pinned in root `package.json` catalog, workspaces reference via `catalog:`.
- **No JS/JSX files**: TypeScript and CSS only.

## Customizing

All instances of `@acme` and `acme` are placeholders. Replace them with your project name in:

- `package.json` (root + all packages)
- `tsconfig.*.json` extends
- `wrangler.json`
- `.devcontainer/`
- `.github/workflows/`
