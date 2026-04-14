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
      health.ts      # GET /api/health (DB + cache + storage check)
      v1/            # Versioned API sub-app
        index.ts     # Middleware chain + route mounts
        posts.ts     # GET/POST /api/v1/posts
        sentry-test.ts  # GET /api/v1/sentry-test
        test-upload.ts  # GET/POST /api/v1/test-upload
    db/              # Database layer
      index.ts       # resolveDatabase() + dbMiddleware
      schema.ts      # Drizzle table definitions
      sqlite.ts      # libsql driver for Node.js/Docker
      types.ts       # Database type export
      migrations/    # Drizzle-generated SQL migrations
    cache/           # Cache layer
      index.ts       # resolveCache() + cacheMiddleware
      types.ts       # Cache interface
    storage/         # File storage layer
      index.ts       # Barrel re-exports
      buckets.ts     # Bucket registry (single source of truth)
      types.ts       # Storage + Buckets type exports
      resolve.ts     # Driver resolution + storageMiddleware
      url.ts         # urlFor(), storageKey(), isProxyDisabled()
      signing.ts     # HMAC signing, S3 presigning, presignUrl()
      helpers.ts     # generateKey(), storeFile(), FileMeta, MAX_UPLOAD_BYTES
    media/           # Read-only file-serving Hono app
      app.ts         # GET /media/<bucket>/:key
    server/          # Nitro glue (SSR + middleware)
      env.ts         # createEnvProxy() for CF/Node env unification
      handler.ts     # createApiEventHandler() shared by API + media
      types.ts       # EnvVars, CfBindings, AppEnv
      error.ts       # Nitro error handler
      middleware/     # Numbered for execution order
        00-env.ts    # Creates env proxy on every request
        20-sentry.ts # Sentry SSR init
        25-auth.ts   # Basic auth (skips /api/health)
      routes/
        api/[...].ts    # Forwards /api/* to Hono API app
        media/[...].ts  # Forwards /media/* to Hono media app
    web/             # TanStack Start frontend
      api-client.ts  # apiFetch() — isomorphic fetch with header forwarding
      routes/        # File-based routing
      router.tsx     # Router init + client Sentry setup
  sentry/            # @acme/sentry — extracted Sentry package
  tsconfig/          # Shared TypeScript configs
  ui/                # @acme/ui — design tokens, CSS reset, components
```

## How the API is Embedded

Nitro catch-all handlers at `server/routes/api/[...].ts` and
`server/routes/media/[...].ts` forward requests to their respective
Hono apps. Both use the shared `createApiEventHandler()` which wraps
the request in a `createEnvProxy()` (so `env.X` falls back to
`process.env.X`) and Sentry error tracking.

## Database Abstraction

The DB driver is resolved at request time based on the runtime:

- **Cloudflare (workerd)**: D1 via `drizzle-orm/d1`
- **Node.js / Docker**: libsql via `@libsql/client`
- **Dev**: local SQLite at `./sqlite.db`

The Hono middleware `dbMiddleware` injects the resolved Drizzle
instance via `context.set("db", ...)`, so handlers are driver-agnostic.

## Cache Abstraction

The cache driver is resolved at request time, mirroring the
database layer:

- **Cloudflare (workerd)**: KV namespace bound as `CACHE`
- **Docker compose**: Valkey via `iovalkey`, when `CACHE_URL` is set
  (e.g. `redis://valkey:6379`)
- **Dev / single-container Docker**: in-memory `Map` with lazy TTL
  eviction

The Hono middleware `cacheMiddleware` injects the resolved cache
via `context.set("cache", ...)`. The interface is intentionally
minimal — `get`, `set(key, value, ttl?)`, `delete` — and values are
strings, so callers handle their own serialization.

## Storage Abstraction

File storage uses [unstorage](https://unstorage.unjs.io/) with
multiple driver backends. Buckets are defined in `storage/buckets.ts`
— the single source of truth for bucket names, access policies, and
per-bucket config accessors.

### Buckets

Each bucket declares accessor functions that read from the env:

```ts
export const BUCKETS = {
  public: {
    public: true,
    r2Binding: (env) => env.STORAGE_PUBLIC,
    s3BucketName: (env) => env.S3_BUCKET_PUBLIC ?? "acme-public",
    baseUrl: (env) => env.STORAGE_URL_PUBLIC ?? null,
    keyPrefix: (env) => env.STORAGE_PREFIX_PUBLIC ?? null,
  },
  private: { ... },
};
```

### Driver Resolution

`resolveBucket()` in `storage/resolve.ts` tries each backend in
priority order — the first one configured wins:

1. **R2 binding** — Cloudflare Workers only, requires billing
2. **KV fallback** — Cloudflare Workers only, free tier via
   `KV_STORAGE=<binding-name>` (e.g. `CACHE`)
3. **S3** — any runtime, when `S3_ENDPOINT` is set
4. **Filesystem** — Node.js only, local dev default

After resolution, a per-bucket `keyPrefix` is applied if configured
(e.g. branch slug for CI preview isolation).

### Adding a New Bucket

1. Add an entry to `BUCKETS` in `storage/buckets.ts` with its
   accessor functions.
2. Add matching bindings to `CfBindings` (`server/types.ts`) and
   `wrangler.json` (Cloudflare) or `compose.yaml` (Docker).
3. Media routes and storage resolution are automatic.

### Uploading Files

Domain handlers use `storeFile()` from `storage/helpers.ts`:

```ts
const { key } = await storeFile(context.var.storage.public, file);
const url = urlFor("public", context.env, key);
```

`storeFile()` validates size, generates a UUID v7 key with a
sanitized extension, stores the raw bytes and metadata (via
unstorage's `setMeta` — stored as a `key$` sidecar entry).

## Media Routes

The Hono app at `media/app.ts` serves files at
`GET /media/<bucket>/:key`. Routes are auto-mounted from
`BUCKET_NAMES` — adding a bucket requires no manual wiring.

**Access control:**

- The proxy returns **404** when a better access path exists
  (`isProxyDisabled`): the bucket has a direct `baseUrl`, or the
  bucket is private and S3 presigning is available.
- **Public buckets** are served with
  `Cache-Control: public, max-age=31536000, immutable` (filenames
  contain a UUID, so they're effectively immutable).
- **Private buckets** require a valid HMAC token
  (`?expires=...&token=...`). Missing or expired tokens → 403.
  No signing key configured → 503.
- **Metadata sidecar keys** (`key$`) are blocked — returns 404 to
  prevent leaking file metadata through the proxy.

## Internal API Calls (`apiFetch`)

`web/api-client.ts` exports `apiFetch(path, init?)` — an isomorphic
fetch wrapper built with `createIsomorphicFn`:

- **Client**: plain `fetch` with relative path.
- **Server (SSR)**: resolves the request origin via `getRequestUrl()`
  and forwards `authorization`, `cookie`, `accept-language`, and
  `x-forwarded-for` headers from the incoming request.

Nitro's internal `serverFetch` can't be used from `web/` code
(export conditions don't match the client/SSR build). The server
path makes a real HTTP request to itself.

## URL Signing & Presigned URLs

`presignUrl()` in `storage/signing.ts` returns the best available
URL for a file, checked in order:

0. **Direct URL** — bucket has a `baseUrl` configured (e.g. R2
   custom domain, CDN). Returned as-is, no signing.
1. **HMAC signing** — `STORAGE_SIGNING_KEY` is set. Generates a
   signed proxy URL: `/media/<bucket>/<key>?expires=<ts>&token=<hmac>`.
   Takes priority over S3 so environments with internal S3 endpoints
   (e.g. Docker Compose with MinIO) can force the proxy path.
2. **S3 presigning** — S3 credentials are set. Generates a SigV4
   presigned URL via `aws4fetch`, direct to the bucket. Worker never
   proxies bytes.
3. **Plain proxy** — no signing configured. Public buckets get
   `/media/<bucket>/<key>`. Private buckets throw 503.

`urlFor()` returns a stable URL (for storing in the database):
`baseUrl + key` if configured, otherwise `/media/<bucket>/<key>`.

`storageKey()` resolves the full key including the bucket's prefix
(unstorage `:` separator). Used by direct URLs and S3 presigned URLs
that bypass the proxy and need the actual object key in the bucket.
Proxy URLs use the raw key — `prefixStorage` adds the prefix on read.

HMAC tokens use constant-time comparison to prevent timing attacks.

## Error Tracking (Sentry)

Sentry is initialized in three places — each runtime context has
different error surfaces:

1. **API** (`@acme/sentry/api`): Hono `onError` handler.
   Skips 4xx, returns `{ error, sentryEventId }` for 5xx.

2. **SSR** (`@acme/sentry/server`):
   `CloudflareClient` for render errors. Flushes before responding.

3. **Client** (`@acme/sentry/client`): `@sentry/react` with
   `ErrorBoundary` at the root. Uses a dummy DSN — the real one
   never reaches the browser.

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
| Cache   | KV              | Valkey (iovalkey)     | In-memory               |
| Storage | R2 or KV or S3  | MinIO (unstorage/s3)  | Filesystem (unstorage)  |

### Docker

**Standalone** (`docker run`): uses the filesystem driver. Private
file access requires setting `STORAGE_SIGNING_KEY` via `-e`. Without
it, private URLs return 503.

**Docker Compose**: includes MinIO (S3-compatible) for storage.
`STORAGE_SIGNING_KEY` is optional — when set, forces HMAC proxy for
private files (since MinIO is internal and not reachable from the
browser). When empty, S3 presigning is used instead. S3 credentials
default to `acme`/`acme-secret-key` — override in `.env` for
production.

**Devcontainer**: sets a dummy `STORAGE_SIGNING_KEY` for development.

## CI/CD

Two workflows in `.github/workflows/`:

**`ci-checks-and-preview.yml`** (every PR + push to main):

1. Lint (oxfmt + oxlint + tsc)
2. Test + coverage upload
3. Create/reuse a per-branch D1 database (fixed for staging)
4. Create/reuse a KV namespace (shared with storage KV fallback)
5. Inject R2 bindings if `R2_BUCKET_PUBLIC`/`R2_BUCKET_PRIVATE` vars
   are set (otherwise skipped — storage falls back to KV)
6. Set runtime vars (Sentry, storage prefixes, signing key, S3 creds,
   public URL). Empty values are filtered out so they don't override
   app defaults.
7. HMAC signing key is auto-derived from `github.repository` + PR
   number + branch slug when `S3_ENDPOINT` is absent. When S3 is
   configured, the signing key is empty (S3 presigning takes over).
8. Build with `NITRO_PRESET=cloudflare-pages`
9. Deploy to Cloudflare Pages
10. Health check against `/api/health`

**`ci-cleanup-preview.yml`** (PR closed): deletes the preview D1
database and KV namespace.

**`ci-docker.yml`** (every PR + push to main): builds the Docker
image, runs standalone + compose smoke tests with health checks.

Each PR gets an isolated database and KV namespace so previews have
real data without polluting staging.

### GitHub Configuration

Set in **Settings → Secrets and variables → Actions**.

**Repository variables** (optional):

- `PROJECT_NAME` — Base name for Pages projects and D1 databases.
  Defaults to the repository name.
- `STAGING_URL` — Custom URL for the staging environment badge.

**Repository variables — storage** (optional):

- `R2_BUCKET_PUBLIC` — R2 bucket name for the public bucket. When
  set alongside `R2_BUCKET_PRIVATE`, R2 bindings are injected into
  the deployed wrangler.json.
- `R2_BUCKET_PRIVATE` — R2 bucket name for the private bucket.
- `STORAGE_URL_PUBLIC` — Direct URL for the public bucket (R2 custom
  domain, CDN). When empty, public files are served through the
  `/media` proxy.
- `S3_REGION` — S3 region. Defaults to `auto`.
- `S3_BUCKET_PUBLIC` — S3 bucket name override for public bucket.
- `S3_BUCKET_PRIVATE` — S3 bucket name override for private bucket.

**Repository secrets — deployment** (required for Cloudflare):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**Repository secrets — S3/presigning** (optional):

- `S3_ENDPOINT` — S3-compatible endpoint (e.g.
  `https://<account>.r2.cloudflarestorage.com` for R2, or an external
  S3 URL). When set, enables S3 presigned URLs for private files and
  disables the auto-derived HMAC signing key.
- `S3_ACCESS_KEY_ID` — S3 access key.
- `S3_SECRET_ACCESS_KEY` — S3 secret key.

**Repository secrets — Sentry** (optional):

- `SENTRY_DSN` — Ingest URL, injected at build time and set as a
  Pages secret.
- `SENTRY_ORG` — Organization slug (source map upload).
  Defaults to the slugified GitHub repository owner.
- `SENTRY_PROJECT` — Project slug (source map upload).
  Defaults to the slugified `PROJECT_NAME`.
- `SENTRY_AUTH_TOKEN` — API token (source map upload).

**Repository secrets — coverage** (optional):

- `CODECOV_TOKEN`

All deployment, Sentry, and storage steps are skipped when their
secrets/variables are absent. The minimum viable deployment needs
only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` — the CI
workflow sets `KV_STORAGE=CACHE` on preview branches automatically,
so storage works out of the box for PRs. Staging and production
need explicit storage configuration (R2 bindings, S3, or manual
`KV_STORAGE`).

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
