# Acme

Full-stack app template: Bun monorepo with TanStack Start, Hono,
Drizzle ORM, and Nitro. Deploys to Cloudflare Pages or Docker.

## Getting Started

```sh
# 1. Clone and rename
git clone <repo-url> my-project && cd my-project
./init.sh my-project   # replaces @acme/acme placeholders

# 2. Install and run
bun install
bun dev
```

The app runs at `http://localhost:3000` with the API at `/api/*`.

A devcontainer config is included for VS Code / GitHub Codespaces.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `bun dev`         | Start dev server                     |
| `bun lint`        | Run oxfmt + oxlint + tsc             |
| `bun lint:fix`    | Auto-fix lint issues                 |
| `bun run test`    | Run tests                            |
| `bun test:cov`    | Run tests with coverage              |
| `bun build`       | Production build                     |
| `bun db:generate` | Generate Drizzle migrations          |
| `bun db:migrate`  | Apply migrations locally             |
| `bun db:seed`     | Seed the local database              |
| `bun db:reset`    | Drop and recreate the local database |

## Deployment

Cloudflare Pages is the primary target. Docker works as an
alternative. See [ARCHITECTURE.md](ARCHITECTURE.md) for deployment
details, CI/CD setup, and required GitHub secrets.
