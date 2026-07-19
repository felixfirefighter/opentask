# Development setup

This is the reproducible local and container setup contract. Product scope and package order remain in the documents routed by `docs/MANIFEST.md`.

## Prerequisites

- Node.js 24.x (version-manager and CI metadata pin 24.18.0)
- Corepack and pnpm 11.14.0, pinned by `package.json`
- Docker Engine 28+ with Compose v2 for PostgreSQL and container verification
- Git 2.40+

## Codex development tooling

The trusted-project `.codex/config.toml` starts the pinned Next.js DevTools MCP bridge for Codex. After cloning or changing that file, trust the repository and restart Codex (or open a new task) so the server is discovered. The bridge is optional development tooling; application and verification commands do not depend on it.

## Host development

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm exec playwright install chromium
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The app runs at `http://127.0.0.1:3000`. Start the background process separately with `pnpm worker`; WP00 intentionally registers zero jobs. Stop local PostgreSQL with `pnpm db:down`.

`BETTER_AUTH_URL` is the exact browser-facing origin, not an internal service URL. OpenTask uses
only a trusted proxy's overwritten `X-Real-IP` header for authentication and demo abuse-control
buckets. Before exposing the service to a network, route all traffic through one ingress that
overwrites that header and block direct access to the application origin. See `SECURITY.md` for the
operational trust boundary. The checked-in Compose port is loopback-only for this reason.

`.env.local` is ignored by Git. `.env.example` contains local placeholders only. Provider keys are optional and must never use the `NEXT_PUBLIC_` prefix.

## Health checks

- `GET /api/health/live` returns process liveness without touching PostgreSQL.
- `GET /api/health/ready` returns readiness only when PostgreSQL is reachable and committed migrations have been applied.
- Failure responses disclose a stable code and correlation ID, never connection details.

## Full Docker path

```sh
docker compose up --build
```

Compose starts PostgreSQL 17, applies committed migrations before the web process, and starts the separate worker from the same image. The web app is exposed on loopback port 3000 and PostgreSQL on loopback port 54329. `docker compose down` preserves the named database volume; remove it only when you explicitly intend to discard local data.

To reproduce the CI production topology audit with an isolated fresh database volume, first stop anything using ports 3000 or 54329, then run:

```sh
docker build --target runner --tag opentask:local .
COMPOSE_PROJECT_NAME=opentask-production-audit docker compose up --detach --no-build --wait
COMPOSE_PROJECT_NAME=opentask-production-audit pnpm test:production
COMPOSE_PROJECT_NAME=opentask-production-audit docker compose down --volumes --remove-orphans
```

`pnpm test:production` deliberately stops the web and worker with SIGTERM after checking health, a shared image, Node as PID 1, and the zero-job worker event. Run the final project-scoped cleanup even when the audit fails; it removes only the isolated audit containers, network, and fresh audit volume. The ordinary `docker compose down` path above still preserves the normal development database volume.

## Database changes

Feature modules own their schema definitions and export them through `shared/db/schema.ts`. Before generating SQL, search `docs/DATA_MODEL.md` and the existing schema for a reusable canonical concept. Then run:

```sh
pnpm db:generate --name=short-name
pnpm db:migrate
pnpm test:db
```

Review and commit generated SQL. `drizzle-kit push` is not an approved migration path. `pnpm db:seed` is an idempotent database seed-readiness check: it verifies connectivity and intentionally writes zero records. Isolated sample data is created or reset only through the app's **Try demo** entry.

## Verification

`pnpm verify:quick` is the fast static/unit gate. `pnpm verify:design` validates tokens and computed browser styles. `pnpm verify` is the canonical full gate and expects PostgreSQL from `pnpm db:up` plus `.env.local`; it includes formatting, lint, a negative boundary probe, strict types, design contracts, non-ignored repository-file secret scanning, unit/database/browser/accessibility tests, migration, worker boot, production build, production-license inventory, and the production dependency audit.

CI invokes the same `pnpm verify` command. A package is not complete while any required gate is failing or skipped.
