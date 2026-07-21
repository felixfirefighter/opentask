# Omplish
<img width="400" height="267" alt="A4 - 1" src="https://github.com/user-attachments/assets/bf0ca51f-dcf6-4392-8f67-a57a80eb4f00" />


Omplish is a self-hostable, open-source personal planning app for tasks, calendar planning, and an optional review-before-apply assistant. Core workflows remain useful without an AI key or paid feature tier.

## Quick start

Use Node 24, Corepack-pinned pnpm 11.14.0, and Docker with Compose:

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:seed` is an idempotent database seed-readiness check: it verifies connectivity and intentionally writes zero records. Open `http://127.0.0.1:3000`; Omplish launches directly and asks for a profile username, which is cached locally before it opens a private workspace for that browser. The current green candidate does not require a background worker; `pnpm worker` remains a zero-job architecture smoke until the reminder package activates jobs.

## Current green candidate

The Deadline-safe Core includes:

- task, list, section, tag, checklist, subtask, search, status, priority, and Markdown workflows;
- all-day and timed schedules, Today, Upcoming, Calendar, and a derived priority matrix;
- an optional GPT-5.6 proposal flow whose output is editable and cannot write until explicit Apply;
- a private versioned JSON export from **Settings → Your data**;
- isolated demo entry, health endpoints, and reproducible Docker deployment.

Set `OPENAI_API_KEY` only on the server, or add a profile-owned key from Settings, to enable `/plan`. When neither is present, the planner explains why it is unavailable while every manual workflow and export remain usable. OpenAI requests use Structured Outputs, send only the selected planning context, set `store: false`, and never write task data directly.

The current implemented candidate does not yet include recurrence, habits, focus timers,
reminders/push, or installability. The active Local-first Full Release plan adds those capabilities in
audited packages on the approved Editorial Focus baseline. Offline mutation synchronization,
collaboration, and premium/billing paths remain excluded. See [docs/SCOPE.md](docs/SCOPE.md) for the
exact target and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for package order.

## How Codex and GPT-5.6 were used

Omplish was developed through an iterative collaboration between the project owner and Codex. The owner defined the product direction and approved the key product and design decisions; Codex supported research synthesis, scope-locked specifications, architecture, modular implementation, and audits for authorization, timezones, accessibility, responsive behavior, dependencies, and release readiness.

Codex also helped preserve the product's non-negotiable engineering boundaries: manual workflows remain usable without AI, task and schedule facts have one canonical representation, and AI cannot change data without user review.

GPT-5.6 is used only for the optional, server-side planning proposal. It turns a brain dump and selected task context into a schema-validated suggestion; deterministic application code retains control of scheduling, ownership, conflicts, and atomic apply. The model receives minimal context with `store: false`, never receives browser-side credentials, and cannot write task data directly. Refusal, stale-data, no-write-before-apply, and idempotency paths are covered by tests.

## Verification and deployment

Install Playwright Chromium once with `pnpm exec playwright install chromium`, then run `pnpm verify` for the canonical local gate. See:

- [Development setup](docs/SETUP.md) for host, PostgreSQL, Docker, health, and migration commands;
- [Railway deployment](docs/DEPLOYMENT.md) for the hosted web/PostgreSQL path and cost controls;
- [Friend test](docs/FRIEND_TEST.md) for the five-minute candidate checklist and feedback format.

For shared UI changes, run `pnpm verify:design` before `pnpm verify`. Repository-owned design tokens and contracts in [DESIGN.md](DESIGN.md) remain authoritative.

## Desktop development

The Electron app uses the same Next.js application and Docker PostgreSQL database as web development:

```sh
pnpm electron:prepare
cp .env.example .env.local
pnpm electron:dev
```

`pnpm electron:dev` starts PostgreSQL, applies migrations, compiles Electron, and opens Omplish. Restart it after changing `electron/main.ts` or `electron/preload.cts` because those processes do not hot-reload.

## Build desktop installers

Production installers bundle the Next.js server plus pinned Node.js and PostgreSQL runtimes, so users do not need Docker, Node, or PostgreSQL. Stage the target runtime artifacts first; see [desktop/runtime/README.md](desktop/runtime/README.md).

Build macOS on macOS:

```sh
# Apple Silicon
ELECTRON_DESKTOP_TARGET=macos-arm64 pnpm electron:dist -- --mac --arm64

# Intel Mac
ELECTRON_DESKTOP_TARGET=macos-x64 pnpm electron:dist -- --mac --x64
```

Build Windows x64 on a Windows machine:

```powershell
$env:ELECTRON_DESKTOP_TARGET = "windows-x64"
pnpm electron:dist -- --win nsis --x64
```

Artifacts are written to `release/`. Set a real version in `package.json` before publishing. Use `pnpm electron:dist:release` only when code-signing credentials are configured: unsigned macOS builds trigger Gatekeeper and unsigned Windows builds trigger SmartScreen. Do not cross-build unless you maintain a verified cross-platform packaging toolchain.

Before distributing an installer, build an unpacked app and run the package checks:

```sh
pnpm electron:dist:dir
pnpm electron:check-package -- --app-dir release/mac-arm64/Omplish.app --target macos-arm64
pnpm electron:runtime-smoke -- --app-dir release/mac-arm64/Omplish.app
pnpm electron:smoke -- --app-dir release/mac-arm64/Omplish.app
```

For Windows, use `release\\win-unpacked` and `--target windows-x64`. The last command requires an interactive desktop session. Full release, signing, and runtime-staging details are in [docs/SETUP.md](docs/SETUP.md#desktop-production-build).

## Repository orientation

1. Read [AGENTS.md](AGENTS.md) for engineering and audit gates.
2. Read [docs/MANIFEST.md](docs/MANIFEST.md) for owners and canonical documents.
3. Read [docs/SCOPE.md](docs/SCOPE.md) before changing product behavior.
4. Use [docs/GOAL.md](docs/GOAL.md) and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for execution order.
5. Use [DESIGN.md](DESIGN.md) and its routed screen contracts for UI work.

## Independence and license

Omplish is independent and is not affiliated with TickTick, Airbnb, or GetDesign. Competitor research informs capability coverage only; code, copy, assets, and visual identity must remain original.

The application is licensed under [AGPL-3.0-or-later](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before contributing or reporting a vulnerability.
