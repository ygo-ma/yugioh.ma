# ---- Stage 1: Build ----
FROM node:24.14.1-alpine AS build

WORKDIR /app
RUN corepack enable

# Install dependencies first (cached unless lockfile/manifests change)
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@acme/app

# Inject the migration-time deps (drizzle-kit + its peer deps drizzle-orm
# and @libsql/client / better-sqlite3, which nitro inlined into the
# bundle) and iovalkey (the cache layer's Valkey client, used in compose
# mode) directly into the nitro-generated server package.json, pinned to
# the exact versions from the lockfile's resolved catalog. The prod
# stage's pnpm install then resolves everything in one shot.
RUN apk add --no-cache yq-go \
 && cd packages/app/.output/server \
 && for dep in drizzle-kit drizzle-orm @libsql/client better-sqlite3 iovalkey; do \
      ver=$(yq ".catalogs.default[\"$dep\"].version" /app/pnpm-lock.yaml) \
      && yq -i -o json ".dependencies[\"$dep\"] = \"$ver\"" package.json; \
    done \
 && yq -i -o json '.pnpm.onlyBuiltDependencies = ["better-sqlite3"]' package.json \
 && rm -rf node_modules

# ---- Stage 2: Production ----
FROM node:24.14.1-alpine

RUN corepack enable

# Prepare the data volume
RUN mkdir -p /var/lib/acme
VOLUME /var/lib/acme

# Self-contained nitro server bundle (with its own package.json)
COPY --from=build /app/packages/app/.output /app

WORKDIR /app/server

# Migrations + drizzle config, alongside the server bundle
COPY packages/app/src/server/db/migrations src/server/db/migrations
COPY packages/app/drizzle.config.ts drizzle.config.ts

# Resolve all server deps in one shot, including libsql's correct
# native binding for this platform.
RUN pnpm install --prod

ENV NODE_ENV=production
ENV PORT=3000

# Default database URL for standalone deployments using the fs driver.
ENV DATABASE_URL=file:///var/lib/acme/sqlite.db

# ── Private file access ──
# To serve private files, set one of:
#   -e S3_ENDPOINT=... -e S3_ACCESS_KEY_ID=... -e S3_SECRET_ACCESS_KEY=...
#   -e STORAGE_SIGNING_KEY=<random-secret>
# Without either, private file URLs return 503.
ENV STORAGE_SIGNING_KEY=

EXPOSE 3000

CMD ["sh", "-c", "pnpm exec drizzle-kit migrate && node index.mjs"]
