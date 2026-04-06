# Architecture

## Stack

Node + pnpm monorepo with TanStack Start (SSR + SPA), Hono API,
Drizzle ORM, and Nitro as the server layer. Cloudflare Pages for
deployment, with Docker as an alternative target. All packages live
under `packages/`.

## Directory Layout

```
packages/
  app/               # The full-stack application
    api/             # Hono API routes
      app.ts         # Root Hono app — mounts health, sentry tunnel, v1
      health.ts      # GET /api/health (DB connectivity check)
      v1/            # Versioned API sub-app
      sentry/        # Error handler + client envelope tunnel
    db/              # Database layer (shared across api + server)
      index.ts       # resolveDatabase() + dbMiddleware
      schema.ts      # Drizzle table definitions
      sqlite.ts      # libsql driver for Node.js/Docker
      types.ts       # Database & AppEnv type exports
      migrations/    # Drizzle-generated SQL migrations
    server/          # Nitro glue (SSR + middleware)
      api/[...].ts   # Catch-all that forwards /api/* to Hono
      middleware/    # Auth, Sentry SSR init
      error.ts       # Nitro error handler
    web/             # TanStack Start frontend
      routes/        # File-based routing
      components/    # React components
      middleware/    # TanStack function middleware
      router.tsx     # Router init + client Sentry setup
      sentry.ts      # Client-side Sentry config
  tsconfig/          # Shared TypeScript configs
  ui/                # (planned) Design tokens, CSS reset, component library
```

## How the API is Embedded

Nitro's catch-all at `server/api/[...].ts` forwards `/api/*` to
Hono's `app.fetch()`, so one deployment serves both SSR pages and
API endpoints.

## Database Abstraction

The DB driver is resolved at request time based on the runtime:

- **Cloudflare (workerd)**: D1 via `drizzle-orm/d1`
- **Node.js / Docker**: libsql via `@libsql/client`
- **Dev**: local SQLite at `./sqlite.db`

The Hono middleware `dbMiddleware` injects the resolved Drizzle
instance via `context.set("db", ...)`, so handlers are driver-agnostic.

## Error Tracking (Sentry)

Sentry is initialized in three places — each runtime context has
different error surfaces:

1. **API** (`api/sentry/error-handler.ts`): Hono `onError` handler.
   Skips 4xx, returns `{ error, sentryEventId }` for 5xx.

2. **SSR** (`server/middleware/sentry.ts` + `server/error.ts`):
   `CloudflareClient` for render errors. Flushes before responding.

3. **Client** (`web/sentry.ts`): `@sentry/react` with `ErrorBoundary`
   at the root. Uses a dummy DSN — the real one never reaches the
   browser.

The client tunnel at `/api/sentry` receives browser envelopes,
rewrites the DSN header, and forwards to Sentry's ingest. This
bypasses ad-blockers and keeps the DSN out of client bundles.

TanStack function middleware marks server-thrown errors with a
non-enumerable `CAPTURED` property. The client `beforeSend` filter
drops these to prevent double-reporting.

## Deployment

| Layer   | Cloudflare      | Docker (self-hosted)  | Dev / Standalone        |
| ------- | --------------- | --------------------- | ----------------------- |
| DB      | D1 (drizzle/d1) | sqld (drizzle/libsql) | SQLite (drizzle/libsql) |
| Cache   | KV              | Valkey                | In-memory               |
| Storage | R2 (unstorage)  | S3/MinIO (unstorage)  | Filesystem (unstorage)  |

Cache and storage are planned but not yet implemented.

## CI/CD

Two workflows in `.github/workflows/`:

**`ci-checks-and-preview.yml`** (every PR + push to main):

1. Lint (oxfmt + oxlint + tsc)
2. Test + coverage upload
3. Create/reuse a per-branch D1 database (fixed for staging)
4. Run migrations + seed on first creation
5. Mutate `wrangler.json` with database ID + Sentry vars
6. Build with `NITRO_PRESET=cloudflare-pages`
7. Deploy to Cloudflare Pages
8. Health check against `/api/health`

**`ci-cleanup-preview.yml`** (PR closed): deletes the preview D1 database.

Each PR gets an isolated database so previews have real data
without polluting staging.

### GitHub Configuration

Set in **Settings → Secrets and variables → Actions**.

**Repository variables** (optional):

- `PROJECT_NAME` — Base name for Pages projects and D1 databases.
  Defaults to the repository name.
- `STAGING_URL` — Custom URL for the staging environment badge.

**Repository secrets — deployment** (required for Cloudflare):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**Repository secrets — Sentry** (optional):

- `SENTRY_DSN` — Ingest URL, injected at build time and set as a Pages secret.
- `SENTRY_ORG` — Organization slug (source map upload).
  Defaults to the slugified GitHub repository owner.
- `SENTRY_PROJECT` — Project slug (source map upload).
  Defaults to the slugified `PROJECT_NAME`.
- `SENTRY_AUTH_TOKEN` — API token (source map upload).

**Repository secrets — coverage** (optional):

- `CODECOV_TOKEN`

All deployment and Sentry steps are skipped when their secrets are absent.

## Conventions

- **SSR-first**: Pages work without JS. Native forms, Post-Redirect-Get.
- **CSS modules**: No Tailwind. Dark mode via
  `prefers-color-scheme`. Mobile-first, responsive to 240px.
- **Strict TypeScript**: `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `noUnusedLocals`, etc.
- **Dependency catalog**: Versions pinned in root `package.json`
  catalog, workspaces reference via `catalog:`.
- **No JS/JSX files**: TypeScript and CSS only.

## Customizing

All instances of `@acme` and `acme` are placeholders. Run the init
script to replace them:

```
./init.sh <project-slug>
```

The script scans all text files, replaces both forms, regenerates
`pnpm-lock.yaml`, then deletes itself.
