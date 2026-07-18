# Development setup

This is the reproducible local and container setup contract. Product scope and package order remain in the documents routed by `docs/MANIFEST.md`.

## Prerequisites

- Node.js 24.x (version-manager and CI metadata pin 24.18.0)
- Corepack and pnpm 11.14.0, pinned by `package.json`
- Docker Engine 28+ with Compose v2 for PostgreSQL and container verification
- Git 2.40+

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

`.env.local` is ignored by Git. `.env.example` contains local placeholders only. Provider keys are optional and must never use the `NEXT_PUBLIC_` prefix.

## Health checks

- `GET /api/health/live` returns process liveness without touching PostgreSQL.
- `GET /api/health/ready` returns readiness only when PostgreSQL is reachable and committed migrations have been applied.
- Failure responses disclose a stable code and correlation ID, never connection details.

## Full Docker path

```sh
docker compose up --build
```

Compose starts PostgreSQL 17, applies committed migrations before the web process, and starts the separate worker from the same image. The web app is exposed on port 3000 and PostgreSQL on local port 54329. `docker compose down` preserves the named database volume; remove it only when you explicitly intend to discard local data.

## Database changes

Feature modules own their schema definitions and export them through `shared/db/schema.ts`. Before generating SQL, search `docs/DATA_MODEL.md` and the existing schema for a reusable canonical concept. Then run:

```sh
pnpm db:generate --name=<short-name>
pnpm db:migrate
pnpm test:db
```

Review and commit generated SQL. `drizzle-kit push` is not an approved migration path. The seed command is idempotent; before feature tables exist it verifies connectivity and writes zero records.

## Verification

`pnpm verify:quick` is the fast static/unit gate. `pnpm verify:design` validates tokens and computed browser styles. `pnpm verify` is the canonical full gate and expects PostgreSQL from `pnpm db:up` plus `.env.local`; it includes formatting, lint, a negative boundary probe, strict types, design contracts, tracked-file secret scanning, unit/database/browser/accessibility tests, migration, worker boot, production build, production-license inventory, and the production dependency audit.

CI invokes the same `pnpm verify` command. A package is not complete while any required gate is failing or skipped.
