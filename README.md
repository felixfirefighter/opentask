# OpenTask (working title)

OpenTask is a self-hostable, open-source personal planning app for tasks, calendar planning, and an optional review-before-apply assistant. Core workflows remain useful without an AI key or paid feature tier.

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

`pnpm db:seed` is an idempotent database seed-readiness check: it verifies connectivity and intentionally writes zero records. Open `http://127.0.0.1:3000`; OpenTask launches directly and asks for a profile username, which is cached locally before it opens a private workspace for that browser. The current green candidate does not require a background worker; `pnpm worker` remains a zero-job architecture smoke until the reminder package activates jobs.

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

## Built with Codex and GPT-5.6

This project was developed through an iterative collaboration between its owner and Codex. The owner set the open-source product goal, required a scope-locked implementation plan before coding, approved the visual proof before deeper implementation, chose an original warm and precise design direction, and later prioritized the Deadline-safe Core so testing, deployment, and submission time stayed protected.

Codex accelerated competitor research synthesis, specification and architecture drafting, modular implementation, and the scope, authorization, timezone, accessibility, responsive-design, dependency, and release audits. The resulting code keeps product capabilities in explicit feature modules and preserves the owner's key decisions: manual workflows work without AI, task and schedule facts have one canonical representation, and AI output is always reviewed before it can write. The GetDesign-informed Editorial Focus system is the approved baseline across the current product and for later feature UI.

GPT-5.6 powers the optional server-side planning proposal step. It converts a brain dump and selected task context into a schema-validated proposal; deterministic application code owns scheduling, ownership, conflicts, and atomic apply. Codex helped implement that boundary and its refusal, stale-data, no-write-before-apply, and idempotency tests. Git commits and the repository contracts preserve the concrete engineering and design decisions without maintaining a separate progress diary.

## Verification and deployment

Install Playwright Chromium once with `pnpm exec playwright install chromium`, then run `pnpm verify` for the canonical local gate. See:

- [Development setup](docs/SETUP.md) for host, PostgreSQL, Docker, health, and migration commands;
- [Railway deployment](docs/DEPLOYMENT.md) for the hosted web/PostgreSQL path and cost controls;
- [Friend test](docs/FRIEND_TEST.md) for the five-minute candidate checklist and feedback format.

For shared UI changes, run `pnpm verify:design` before `pnpm verify`. Repository-owned design tokens and contracts in [DESIGN.md](DESIGN.md) remain authoritative.

## Electron desktop build

The desktop target keeps the Next.js server, application services, and PostgreSQL data model intact.
Development uses the existing Docker PostgreSQL service; production packages a Node runtime and a
PostgreSQL 17 runtime for Windows x64 and macOS x64/arm64. See [Desktop setup](docs/SETUP.md#desktop-development)
and [desktop runtime artifacts](desktop/runtime/README.md).

## Repository orientation

1. Read [AGENTS.md](AGENTS.md) for engineering and audit gates.
2. Read [docs/MANIFEST.md](docs/MANIFEST.md) for owners and canonical documents.
3. Read [docs/SCOPE.md](docs/SCOPE.md) before changing product behavior.
4. Use [docs/GOAL.md](docs/GOAL.md) and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for execution order.
5. Use [DESIGN.md](DESIGN.md) and its routed screen contracts for UI work.

## Independence and license

OpenTask is independent and is not affiliated with TickTick, Airbnb, or GetDesign. Competitor research informs capability coverage only; code, copy, assets, and visual identity must remain original.

The application is licensed under [AGPL-3.0-or-later](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before contributing or reporting a vulnerability.
