# Acme

Full-stack app template: Node + pnpm monorepo with TanStack Start, Hono,
Drizzle ORM, and Nitro. Deploys to Cloudflare Pages or Docker.

## Getting Started

```sh
git clone <repo-url> my-project && cd my-project

# ...you probably want to open the project in a dev container at this point...

./init.sh my-project   # replaces acme/Acme/ACME placeholders

pnpm install
pnpm dev
```

The app runs at `http://localhost:3000` with the API at `/api/*`.

## Dev Container

The devcontainer is recommended for a consistent environment with Node.js,
Playwright, and passwordless sudo pre-configured. Open the Project in VS Code
or GitHub Codespaces and it will prompt you to reopen in the container.

To add personal setup (extra tools, shell config, etc.), create
`.devcontainer/user/build.sh` — it runs at image build time and
is gitignored.

## Scripts

| Command            | Description                          |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | Start dev server                     |
| `pnpm lint`        | Run oxfmt + oxlint + tsc             |
| `pnpm lint:fix`    | Auto-fix lint issues                 |
| `pnpm test`        | Run tests                            |
| `pnpm test:cov`    | Run tests with coverage              |
| `pnpm build`       | Production build                     |
| `pnpm db:generate` | Generate Drizzle migrations          |
| `pnpm db:migrate`  | Apply migrations locally             |
| `pnpm db:seed`     | Seed the local database              |
| `pnpm db:reset`    | Drop and recreate the local database |
| `pnpm storybook`   | Run UI Storybook at `localhost:6006` |

## Deployment

Cloudflare Pages is the primary target. Docker works as an
alternative. See [ARCHITECTURE.md](ARCHITECTURE.md) for deployment
details, CI/CD setup, and required GitHub secrets.
