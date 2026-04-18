# Architecture

## Stack

Node + pnpm monorepo with TanStack Start (SSR + SPA), Hono API,
Drizzle ORM, and Nitro as the server layer. Cloudflare Pages for
deployment, with Docker as an alternative target. All packages live
under `packages/`.

## Directory Layout

```
packages/
  app/                        # Full-stack application
    src/
      server/                 # Server-side glue
        api/app.ts            # Hono app at /api (mounts v1)
        api/v1/               # Versioned API (posts, sentry-test, test-upload)
        media/app.ts          # Hono app at /media (file serving)
        health/app.ts         # Hono app at /health (db+cache+storage check)
        sentry/app.ts         # Hono app at /sentry (browser envelope tunnel)
        middleware/           # Alphabetical execution order
          50-auth.ts          # Basic auth (skips /health)
        db/                   # createDbKit wiring + schema
          index.ts            # resolveDbUrl + createDbKit({ databaseUrl })
          schema.ts
          seed.ts             # CLI entry
          migrations/
        cache.ts              # createCacheKit({ cacheUrl })
        storage.ts            # createStorageKit({ buckets, signingKey, s3, kvBindingName })
        types.ts              # EnvVars, CfBindings, AppEnv
      routes/                 # TanStack Start file-based routes
      router.tsx              # Router init + client Sentry setup
      start.ts                # TanStack Start server entry
    vite.config.ts            # acmeServer({ baseDir, apps, middlewareDir })
  server/                     # @acme/server — nitro + Hono glue
    src/vite.ts               # acmeServer() vite plugin
    src/handler.ts            # createApiEventHandler() wrap
    src/env.ts                # createEnvProxy()
    src/nitro/                # Built-in nitro error handler + middleware
  db/                         # @acme/db — createDbKit + resolver
  cache/                      # @acme/cache — createCacheKit + resolver
  storage/                    # @acme/storage — createStorageKit + drivers
  sentry/                     # @acme/sentry — client / hono / server glue
  tsconfig/                   # Shared TypeScript configs
  ui/                         # @acme/ui — design tokens, CSS reset, components
```

## How the App is Embedded

`packages/app/vite.config.ts` uses the `acmeServer()` vite plugin
from `@acme/server/vite`:

```ts
acmeServer({
  baseDir: "./src/server",
  apps: ["api", "media", "health", "sentry"],
  middlewareDir: "middleware"
});
```

Each entry in `apps` resolves to `<name>/app.ts` under `baseDir` and
is registered as a programmatic, lazy-loaded Nitro handler at
`/<name>/**`. `middlewareDir` is scanned alphabetically for request
middleware. Nitro's file-based scanning is disabled
(`serverDir: false`) so there's no double-mounting.

Each Hono app is wrapped with `createApiEventHandler()`, which
applies `createEnvProxy()` (so `env.X` falls back to `process.env.X`
outside CF) and `withSentry()` error capture.

The plugin also collects `cloudflareExternals` from every workspace
dep's `package.json` and feeds them into rolldown's `external` list —
so Node-only drivers (`@libsql/client`, `drizzle-orm/libsql`,
`iovalkey`, `unstorage/drivers/fs`) are excluded from the worker
bundle automatically.

## Kit-Factory Packages

`@acme/db`, `@acme/cache`, and `@acme/storage` each expose a
`createXKit({ ... })` factory. The app wires each one in a single
file (`src/server/db/index.ts`, `cache.ts`, `storage.ts`) with
env-accessor callbacks; the factory returns pre-bound `resolveX()`
and a Hono `xMiddleware`. Runtime selection (workerd vs Node) lives
inside each package's resolver.

## Database Abstraction

```ts
createDbKit({
  schema,
  databaseUrl: (env) => resolveDbUrl(env.DATABASE_URL)
});
// → { resolveDatabase, dbMiddleware, seed }
```

`databaseUrl` returns a non-undefined string; the callback is
invoked lazily (via thunk) on any non-workerd path — D1 skips it
entirely. The app's `resolveDbUrl` throws in production when
`DATABASE_URL` is missing and defaults to `file:sqlite.db` in dev.

Runtime resolution:

- **Cloudflare (workerd)**: D1 via `env.DB` binding + `drizzle-orm/d1`
- **Node.js + `file:` URL**: `better-sqlite3` (sync native binding,
  faster than libsql for on-disk access)
- **Node.js + remote URL** (`http://`, `libsql://`, …): libsql via
  `@libsql/client`

All drivers load via dynamic import so native and Node-only modules
stay out of the worker bundle.

`dbMiddleware` injects the resolved Drizzle instance via
`context.set("db", ...)`, so handlers are driver-agnostic. `seed(url, path)`
is CLI-only: caller provides the url string directly.

## Cache Abstraction

```ts
createCacheKit({ cacheUrl: (env) => env.CACHE_URL });
// → { resolveCache, cacheMiddleware }
```

- **Cloudflare (workerd)**: KV via `env.CACHE` binding
- **Docker compose**: Valkey (`iovalkey`) when `CACHE_URL` is set
- **Dev / single-container Docker**: in-memory `Map` with lazy TTL
  eviction

Interface is intentionally minimal — `get`, `set(key, value, ttl?)`,
`delete`, values are strings. Callers own their serialization.

## Storage Abstraction

File storage uses [unstorage](https://unstorage.unjs.io/) with
multiple driver backends. Buckets are declared inline in the app's
`src/server/storage.ts` via `createStorageKit`:

```ts
createStorageKit({
  signingKey: (env) => env.STORAGE_SIGNING_KEY,
  kvBindingName: (env) => env.KV_STORAGE,
  s3: (env) => /* { endpoint, accessKeyId, secretAccessKey, region } | undefined */,
  buckets: {
    public: {
      public: true,
      r2Binding: (env) => env.STORAGE_PUBLIC,
      s3BucketName: (env) => env.S3_BUCKET_PUBLIC ?? "acme-public",
      baseUrl: (env) => env.STORAGE_URL_PUBLIC ?? null,
      keyPrefix: (env) => env.STORAGE_PREFIX_PUBLIC ?? null,
    },
    private: { /* ... */ },
  },
})
```

Each bucket is a single source of truth for its access policy and
per-env accessors. The kit returns `resolveStorage`,
`storageMiddleware`, `createMediaRoute`, `presignUrl`,
`verifyHmacToken`, plus url helpers.

### Driver Resolution

The kit's internal `resolveBucket()` tries each backend in priority
order — the first one configured wins:

1. **R2 binding** — Cloudflare Workers only, requires billing
2. **KV fallback** — Cloudflare Workers only, free tier via
   `KV_STORAGE=<binding-name>` (e.g. `CACHE`)
3. **S3** — any runtime, when `S3_ENDPOINT` is set
4. **Filesystem** — Node.js only, local dev default

After resolution, a per-bucket `keyPrefix` is applied if configured
(e.g. branch slug for CI preview isolation).

### Adding a New Bucket

1. Add an entry to the `buckets` object in `src/server/storage.ts`
   with its accessor functions.
2. Add matching bindings to `CfBindings` (`src/server/types.ts`)
   and `wrangler.json` (Cloudflare) or `compose.yaml` (Docker).
3. Media routes and storage resolution are automatic.

### Uploading Files

Domain handlers use `storeFile()` from `@acme/storage/helpers`:

```ts
const { key } = await storeFile(context.var.storage.public, file);
const url = urlFor("public", context.env, key);
```

`storeFile()` validates size, generates a UUID v7 key with a
sanitized extension, stores the raw bytes and metadata (via
unstorage's `setMeta` — stored as a `key$` sidecar entry).

## Media Routes

The Hono app at `src/server/media/app.ts` mounts
`createMediaRoute()` (from the storage kit) and serves files at
`GET /media/<bucket>/:key`. Per-bucket routes are auto-mounted from
the kit's `buckets` config — adding a bucket requires no manual
wiring.

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

`src/api-client.ts` exports `apiFetch(path, init?)` — an isomorphic
fetch wrapper built with `createIsomorphicFn`:

- **Client**: plain `fetch` with relative path.
- **Server (SSR)**: resolves the request origin via `getRequestUrl()`
  and forwards `authorization`, `cookie`, `accept-language`, and
  `x-forwarded-for` headers from the incoming request.

Nitro's internal `serverFetch` can't be used from client-reachable
code (export conditions don't match the client/SSR build). The
server path makes a real HTTP request to itself.

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

1. **Hono apps** (`@acme/sentry/hono`): `createSentryHonoErrorHandler()`
   onError handler + `withSentry` wrap (applied by
   `createApiEventHandler` to every app registered via
   `acmeServer({ apps })`). `HTTPException`s pass through via
   `error.getResponse()` — body shape is whatever the thrower set;
   5xx variants are logged to stderr and captured to Sentry, 4xx
   aren't. Other uncaught errors are logged, captured, and returned
   as JSON 500 `{ error, sentryEventId }` (event ID is `null` when
   capture was suppressed or the SDK isn't initialized). stderr
   logging is what makes backend errors visible in `docker logs`
   when no `SENTRY_DSN` is configured. Pass `ignoreUserAgent` to
   suppress **both** log and capture for a probe client (e.g. the CI
   health probe whose 5xx during post-deploy warmup is expected
   noise).

2. **SSR** (`@acme/sentry/server`):
   `CloudflareClient` for render errors. Flushes before responding.

3. **Client** (`@acme/sentry/client`): `@sentry/react` with
   `ErrorBoundary` at the root. Uses a dummy DSN — the real one
   never reaches the browser.

The client tunnel at `/sentry` (a Hono app registered via
`acmeServer({ apps: [..., "sentry"] })`) receives browser envelopes,
rewrites the DSN header, and forwards to Sentry's ingest. This
bypasses ad-blockers and keeps the DSN out of client bundles.

TanStack function middleware marks server-thrown errors with a
non-enumerable `CAPTURED` property. The client `beforeSend` filter
drops these to prevent double-reporting.

## Deployment

| Layer   | Cloudflare      | Docker (self-hosted)  | Dev / Standalone                |
| ------- | --------------- | --------------------- | ------------------------------- |
| DB      | D1 (drizzle/d1) | sqld (drizzle/libsql) | SQLite (drizzle/better-sqlite3) |
| Cache   | KV              | Valkey (iovalkey)     | In-memory                       |
| Storage | R2 or KV or S3  | MinIO (unstorage/s3)  | Filesystem (unstorage)          |

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
10. Health check against `/health` — the CI probe sets a
    `User-Agent: acme-ci-health-probe`. The `/health` route's
    `createSentryHonoErrorHandler({ ignoreUserAgent: "..." })` skips
    stderr logging and Sentry capture for that UA during the
    post-deploy warmup window (bindings can briefly race the worker).
    Other callers still surface 5xx to both.

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

<!-- init-strip:start -->

## Customizing

All instances of `acme`, `Acme`, and `ACME` are placeholders. Run the
init script to replace them:

```
./init.sh <project-slug>
```

Given a slug like `my-project`, the script rewrites:

- `@acme/*` → `@my-project/*` (kebab — npm package scope)
- `acme` (anywhere else) → `myproject` (flat lowercase, dashes
  stripped — keeps identifiers like `acmeServer` valid and Docker /
  Cloudflare / compose names lowercase-only)
- `Acme` → `MyProject` (PascalCase — type names, JSX, titles)
- `ACME` → `MY_PROJECT` (CONSTANT_CASE — env vars, constants)

The slug must start with a lowercase letter and contain only
lowercase letters, numbers, and dashes.

It scans all text files, regenerates `pnpm-lock.yaml`, then deletes
itself.

<!-- init-strip:end -->
