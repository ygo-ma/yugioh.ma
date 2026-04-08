# ---- Stage 1: Build ----
FROM node:24.14.1-alpine AS build

WORKDIR /app
RUN corepack enable

# Install dependencies first (cached unless lockfile/manifests change)
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@acme/app

# Inject the migration-time deps (drizzle-kit + its peer deps drizzle-orm
# and @libsql/client, which nitro inlined into the bundle) and iovalkey
# (the cache layer's Valkey client, used in compose mode) directly into
# the nitro-generated server package.json, pinned to the exact versions
# from the lockfile's resolved catalog. The prod stage's pnpm install
# then resolves everything in one shot.
RUN apk add --no-cache yq-go \
 && cd packages/app/.output/server \
 && for dep in drizzle-kit drizzle-orm @libsql/client iovalkey; do \
      ver=$(yq ".catalogs.default[\"$dep\"].version" /app/pnpm-lock.yaml) \
      && yq -i -o json ".dependencies[\"$dep\"] = \"$ver\"" package.json; \
    done \
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
COPY packages/app/db/migrations db/migrations
COPY packages/app/drizzle.config.ts drizzle.config.ts

# Resolve all server deps in one shot, including libsql's correct
# native binding for this platform.
RUN pnpm install --prod

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:///var/lib/acme/sqlite.db

EXPOSE 3000

CMD ["sh", "-c", "pnpm exec drizzle-kit migrate && node index.mjs"]
