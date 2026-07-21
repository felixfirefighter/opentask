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

The app runs at `http://127.0.0.1:3000`. `pnpm worker -- --check` validates the notification
configuration, database schema, and both queues without registering consumers. Set
`REMINDER_WORKER_MODE=enabled` and start the active background process separately with
`pnpm worker`; keep `pnpm dev` and `pnpm worker` in separate terminals. The check reports
`declaredJobCount: 2`, while the active process reports `registeredJobCount: 2` after its delivery
and maintenance consumers are ready.

Open **Settings → App and reminders** to inspect installability and update state. Chromium-based browsers can
offer installation from an explicit browser prompt or menu; loopback origins count as secure
contexts. The service worker caches only the content-free offline document, original public icons,
and fingerprinted `/_next/static/` assets. It never caches authenticated HTML or API/export
responses and never queues a write. An already open workspace becomes read-only when disconnected;
a cold offline navigation shows only the content-free fallback.

`BETTER_AUTH_URL` is the exact browser-facing origin, not an internal service URL. For local
loopback only, configuring either `http://127.0.0.1:3000` or `http://localhost:3000` also accepts
the other spelling with that exact scheme and port. This is an explicit two-origin policy, not a
wildcard; a different scheme, port, hostname, or any second non-loopback origin remains rejected.
OpenTask uses only a trusted proxy's overwritten `X-Real-IP` header for authentication and demo
abuse-control buckets. Before exposing the service to a network, route all traffic through one
ingress that overwrites that header and block direct access to the application origin. See
[security operations](SECURITY.md) for the operational trust boundary. The checked-in Compose port
is loopback-only for this reason.

`.env.local` is ignored by Git. `.env.example` contains local placeholders only. Provider keys are optional and must never use the `NEXT_PUBLIC_` prefix.

## Optional browser-push reminders

Tasks, habits, Focus, export, and local startup remain functional without push configuration. To
exercise the complete reminder path, generate a VAPID pair and a separate 32-byte subscription
encryption key in a private terminal:

```sh
pnpm exec web-push generate-vapid-keys
node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(32).toString('base64url'))"
```

Copy the generated values into ignored `.env.local`; do not commit them, paste them into client
code, or prefix them with `NEXT_PUBLIC_`:

```dotenv
REMINDER_WORKER_MODE=enabled
WEB_PUSH_VAPID_SUBJECT=mailto:operator@example.com
WEB_PUSH_VAPID_PUBLIC_KEY=<generated-public-key>
WEB_PUSH_VAPID_PRIVATE_KEY=<generated-private-key>
PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION=1
PUSH_SUBSCRIPTION_ENCRYPTION_KEYS=1:<generated-32-byte-base64url-key>
```

The VAPID variables are an all-or-none group. The encryption variables are also an all-or-none
group; the active nonnegative version must exist in the comma-separated keyring. Retain older
`<version>:<key>` entries while rows encrypted with them still exist. Partial or malformed groups
fail notification initialization or the worker check instead of silently disabling security.

Restart both web and worker after changing these values, then run the non-consuming check before
starting the worker:

```sh
pnpm worker -- --check
pnpm worker
```

The web and worker processes must receive the same server-only notification configuration. Browser
permission and subscription are initiated only by an explicit user action in the app. An enabled
worker is reported as configured but unverified because the web process does not infer worker
liveness. If VAPID, encryption, browser support, permission, subscription, or the active worker is
absent, the UI reports that degraded state rather than claiming delivery.

## Health checks

- `GET /api/health/live` returns process liveness without touching PostgreSQL.
- `GET /api/health/ready` returns readiness only when PostgreSQL is reachable and committed migrations have been applied.
- Failure responses disclose a stable code and correlation ID, never connection details.

## Full Docker path

```sh
docker compose up --build
```

Compose starts PostgreSQL 17, applies committed migrations before the web process, and starts the separate worker from the same image. The web app is exposed on loopback port 3000 and PostgreSQL on loopback port 54329. `docker compose down` preserves the named database volume; remove it only when you explicitly intend to discard local data.

The checked-in Compose topology intentionally runs both notification queues with the push provider
and subscription storage unconfigured. This proves the active worker and honest provider-degraded
path without embedding secrets. To test delivery in containers, use a private, uncommitted Compose
override or deployment secret store to supply the same five VAPID/encryption variables to both
`web` and `worker`; never add real values to `compose.yaml`.

To reproduce the CI production topology audit with an isolated fresh database volume, first stop anything using ports 3000 or 54329, then run:

```sh
docker build --target runner --tag opentask:local .
COMPOSE_PROJECT_NAME=opentask-production-audit docker compose up --detach --no-build --wait
COMPOSE_PROJECT_NAME=opentask-production-audit pnpm test:production
COMPOSE_PROJECT_NAME=opentask-production-audit docker compose down --volumes --remove-orphans
```

`pnpm test:production` deliberately stops the web and worker with SIGTERM after checking health, PWA
metadata/static assets, a shared image, Node as PID 1, the active two-job worker readiness event, and
the non-consuming two-queue worker check. Run the final
project-scoped cleanup even when the audit fails; it removes only the isolated audit containers,
network, and fresh audit volume. The ordinary `docker compose down` path above still preserves the
normal development database volume.

## Clean shutdown

- Stop `pnpm dev` and `pnpm worker` with `Ctrl-C`. The worker stops accepting work, allows up to 15
  seconds for its notification queues to finish, closes the queue connection, and then exits.
- `docker compose down` sends the container processes their normal termination signal. The worker's
  20-second Compose grace period exceeds its internal 15-second drain window.
- `pnpm db:down` or ordinary `docker compose down` preserves the named PostgreSQL volume. Add
  `--volumes` only for an explicitly disposable audit project or when you intentionally want to
  erase that project's local database.

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
