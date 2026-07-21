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

The app runs at `http://127.0.0.1:3000`. Start the background process separately with `pnpm worker`;
the current fallback registers zero product jobs, and P6 activates reminder jobs. Stop local
PostgreSQL with `pnpm db:down`.

## Desktop development

Electron development reuses the host development database and starts the Next.js development server
inside an Electron window. It does not require a separate PostgreSQL installation:

```sh
pnpm electron:prepare
cp .env.example .env.local
pnpm electron:dev
```

`pnpm electron:dev` starts Docker PostgreSQL, applies migrations, compiles the Electron TypeScript
entrypoint, and launches Electron. The local browser/API contract remains unchanged. OpenAI remains
optional; `OPENAI_API_KEY` may be present in `.env.local` for planner development but is never exposed
to the renderer. A profile-owned key can also be added from Settings and is encrypted in the local
database. `OPENAI_API_KEY_ENCRYPTION_KEY` may be set separately so rotating the auth secret does not
invalidate saved provider credentials.

If the Electron process is running but no window is visible, stop it with `Ctrl+C` and run
`pnpm electron:dev` again. The Electron main process is compiled at startup; an already-running
process does not pick up changes to `electron/main.ts`. The current launcher shows the window after
the local Next.js URL finishes loading instead of waiting indefinitely for Electron's optional
`ready-to-show` event.

## Desktop production build

The desktop build is an offline runtime package. Before packaging, stage the target-specific Node and
PostgreSQL binaries listed in [desktop/runtime/README.md](../desktop/runtime/README.md). The installer
must not download runtimes or require Docker, Node, PostgreSQL, pnpm, or internet access on the user's
machine.

The current staged release baseline is Node.js `v24.14.1` and PostgreSQL `17.10-2`. The generated
`desktop/runtime/manifest.json` is the source/checksum record for those artifacts.

Stage each target from pinned, already-extracted archives with the repository helper:

```sh
pnpm electron:stage-runtime -- --target macos-arm64 \
  --node /path/to/extracted/node/bin \
  --node-archive /path/to/node-archive.tar.gz \
  --node-version v24.x.y \
  --node-source-url https://nodejs.org/dist/v24.x.y/node-v24.x.y-darwin-arm64.tar.gz \
  --postgres /path/to/extracted/postgresql \
  --postgres-archive /path/to/postgresql-archive.tar.gz \
  --postgres-version 17.x \
  --postgres-source-url https://example.invalid/pinned-postgresql-archive
```

Repeat for `macos-x64` and `windows-x64` as required. The helper calculates the archive hashes and
writes `desktop/runtime/manifest.json`; do not commit the large runtime trees or original archives
unless the release storage policy explicitly allows it.

Build the current host's installer with:

```sh
pnpm electron:dist
```

Set a real release version in `package.json` before publishing (the current repository development
version is `0.0.0`); Electron Builder uses it in the installer metadata and artifact filename. Keep
the version change in the release commit and record the resulting artifact checksums.

Use the release configuration only after signing credentials are available. It enables macOS
notarization and hardened runtime; an unsigned local build should continue to use `pnpm
electron:dist`.

For a specific macOS architecture, set the runtime target before building:

```sh
ELECTRON_DESKTOP_TARGET=macos-arm64 pnpm electron:dist -- --mac --arm64
ELECTRON_DESKTOP_TARGET=macos-x64 pnpm electron:dist -- --mac --x64
```

Build the Windows NSIS installer on a Windows x64 release machine:

```powershell
$env:ELECTRON_DESKTOP_TARGET = "windows-x64"
pnpm electron:dist:release -- --win nsis --x64
```

For Windows signing, provide an Authenticode `.pfx`/`.p12` through `WIN_CSC_LINK` and its password
through `WIN_CSC_KEY_PASSWORD` in the release environment. Keep both outside the repository. Verify
the resulting installer with Windows `signtool verify /pa` and inspect the publisher in Explorer.

For macOS signing and notarization, run on macOS with a Developer ID Application certificate and
App Store Connect API key:

```sh
export CSC_LINK=/secure/path/developer-id-application.p12
export CSC_KEY_PASSWORD='certificate-password'
export APPLE_API_KEY="$(base64 < /secure/path/AuthKey_KEYID.p8 | tr -d '\\n')"
export APPLE_API_KEY_ID=KEYID
export APPLE_API_ISSUER=ISSUER_UUID
export APPLE_TEAM_ID=TEAM_ID
ELECTRON_DESKTOP_TARGET=macos-arm64 pnpm electron:dist:release -- --mac --arm64
```

The API-key variables are preferred for CI. An Apple ID app-specific password flow is also
supported with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. Verify the finished
bundle with `codesign --verify --deep --strict`, `spctl --assess --type execute`, and
`xcrun stapler validate`. Electron Builder documents the certificate variables and notarization
credential alternatives in its [code-signing guide](https://www.electron.build/code-signing) and
[notarization guide](https://www.electron.build/docs/notarization/).

Build macOS artifacts on macOS and Windows artifacts on Windows unless a separately verified
cross-build toolchain is maintained. `pnpm electron:dist:dir` produces an unpacked app for smoke
testing before signing.

Run the packaged-content audit before signing:

```sh
pnpm electron:check-package -- \
  --app-dir release/mac-arm64/OpenTask.app \
  --target macos-arm64
```

On Windows, point `--app-dir` at `release\\win-unpacked` and use `--target windows-x64`. The audit
checks the standalone server, migration script, runtime manifest/notices, all target executables,
PostgreSQL library/share data, and absence of common development files.

Build an unpacked production directory for smoke testing with:

```sh
pnpm electron:dist:dir
```

For an isolated lifecycle smoke, set `OPENTASK_USER_DATA_PATH` to a disposable absolute directory
before launching the unpacked executable. This test-only override keeps the smoke database and auth
secret outside the developer's normal OpenTask profile; it is not required for normal users.

The automated packaged smoke uses the same isolated path, waits for the instance secret and PostgreSQL
cluster, then exercises the real graceful shutdown path:

```sh
pnpm electron:runtime-smoke -- --app-dir release/mac-arm64/OpenTask.app
pnpm electron:smoke -- --app-dir release/mac-arm64/OpenTask.app
```

`electron:runtime-smoke` is headless-safe and verifies the packaged runtime, database initialization,
migrations, local profile setup, internal session persistence across a second cold start,
and shutdown. `electron:smoke` additionally launches the native Electron window and must be run from
an interactive desktop session; the runtime smoke does not replace that native GUI check.

On Windows, use `release\\win-unpacked` as `--app-dir`. Run this from an interactive native desktop
session; a headless terminal without access to the platform window server is not valid G10 evidence.

The build performs a standalone Next.js Webpack build, compiles the Electron main/preload process, validates
the staged runtime artifacts, prepares only the selected target's runtime tree, and runs `electron-builder`.
On first launch, Electron creates a stable
local auth secret, initializes PostgreSQL under the OS application-data directory, runs committed
Drizzle migrations, and starts Next.js on a loopback port. User data is not stored in the installed
application directory.

The current packaging configuration produces Windows NSIS and macOS DMG artifacts. Production releases
still need platform signing/notarization credentials and a release record containing the exact Node
and PostgreSQL versions, source archives, checksums, and license notices.

### Installed-app operations

The installed application keeps its database and generated instance secret outside the installation
directory:

- Windows: `%APPDATA%\\OpenTask`
- macOS: `~/Library/Application Support/OpenTask`

Before upgrading, exit OpenTask completely and copy that entire directory to a protected backup
location. Do not copy individual PostgreSQL files and do not copy the directory while the app is
running. The backup contains the local database and the secret required to keep the local instance
stable; protect it like application data.

To upgrade, install the newer signed NSIS/DMG build over the existing installation, then launch it
once while disconnected from the network. Electron starts the bundled PostgreSQL instance and applies
the committed migrations before opening the window. If startup or migration fails, close the app,
retain the original installation and user-data backup, and record the displayed error; do not delete
`postgres-data` as a first recovery step.

Uninstalling the application removes the installed binaries, not the separately stored user data by
design. An explicit future "remove local data" operation may delete the platform-specific directory,
but that irreversible operation is not part of the current installer flow.

Before publishing an artifact, inspect the unpacked application. It must contain `app.asar`, the
standalone Next server, the migration script, the runtime manifest, the runtime notices, and the
target-specific Node/PostgreSQL trees. It must not contain `.env` files, Docker configuration, or
the development package manager. A desktop installer is not release-ready until the same check is
performed on Windows and macOS from a clean target machine.

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

`pnpm test:production` deliberately stops the web and worker with SIGTERM after checking health, a shared image, Node as PID 1, and the current zero-job worker event. P6 must extend this smoke for active reminder jobs before that package can integrate. Run the final project-scoped cleanup even when the audit fails; it removes only the isolated audit containers, network, and fresh audit volume. The ordinary `docker compose down` path above still preserves the normal development database volume.

## Database changes

Feature modules own their schema definitions and export them through `shared/db/schema.ts`. Before generating SQL, search `docs/DATA_MODEL.md` and the existing schema for a reusable canonical concept. Then run:

```sh
pnpm db:generate --name=short-name
pnpm db:migrate
pnpm test:db
```

Review and commit generated SQL. `drizzle-kit push` is not an approved migration path. `pnpm db:seed` is an idempotent database seed-readiness check: it verifies connectivity and intentionally writes zero records. The app creates or resets its isolated workspace internally after the first local profile setup.

## Verification

`pnpm verify:quick` is the fast static/unit gate. `pnpm verify:design` validates tokens and computed browser styles. `pnpm verify` is the canonical full gate and expects PostgreSQL from `pnpm db:up` plus `.env.local`; it includes formatting, lint, a negative boundary probe, strict types, design contracts, non-ignored repository-file secret scanning, unit/database/browser/accessibility tests, migration, worker boot, production build, production-license inventory, and the production dependency audit.

CI invokes the same `pnpm verify` command. A package is not complete while any required gate is failing or skipped.
