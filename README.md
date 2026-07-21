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

`pnpm db:seed` is an idempotent database seed-readiness check: it verifies connectivity and intentionally writes zero records. Open `http://127.0.0.1:3000`, then create an account or choose **Try demo** to create/reset a private sample workspace for that browser. The implemented baseline does not require a background worker; `pnpm worker` remains a zero-job architecture smoke until the reminder package activates jobs.

For local use, you may open either `http://127.0.0.1:3000` or `http://localhost:3000`. When
`BETTER_AUTH_URL` names either loopback host, OpenTask accepts the other spelling only on the same
scheme and port; you do not need to change the environment file when switching between them.

## Implemented baseline

The implemented baseline includes:

- task, list, section, tag, checklist, subtask, search, status, priority, and Markdown workflows;
- contextual quick add with atomic task-plus-schedule creation, all-day and timed schedules, Today,
  Upcoming, a full Calendar create/edit flow, and a derived priority matrix;
- canonical task-detail navigation from planning/search surfaces, local-midnight and preference-aware
  projection refresh, and recoverable optimistic/network-conflict states;
- bounded schedule-based recurrence with approved presets, deterministic all-day/timed occurrences,
  per-occurrence complete/skip/undo, future-series edit/end, and Today, Upcoming, Calendar, agenda,
  Matrix, search, demo, and export integration;
- boolean and numeric habits with daily, selected-weekday, or target-per-week schedules; Today
  check-ins, quantity/note edits, undo/skip/unachieved, archive/restore, derived streaks, seven-day
  strips, monthly heat maps, and deterministic demo/export integration;
- authoritative Pomodoro, stopwatch, and explicit break sessions with optional task/habit links,
  pause/reconnect/resume/finish/discard controls, corrected or deleted completed history, derived
  today/seven-day totals, deterministic demo data, and completed-focus export;
- an optional GPT-5.6 proposal flow whose output is editable and cannot write until explicit Apply;
- persisted planner Review/Result restoration after refresh or navigation, plus an explicit no-key
  capability state in Settings;
- a private versioned JSON export from **Settings → Your data**;
- isolated demo entry, health endpoints, and reproducible Docker deployment.

Set `OPENAI_API_KEY` only on the server to enable `/plan`. When it is absent, the planner explains why it is unavailable while every manual workflow and export remain usable. OpenAI requests use Structured Outputs, send only the selected planning context, set `store: false`, and never write task data directly.

The next unfinished package is P5, the installable static PWA shell with an honest read-only offline
fallback. Reminders/push and final release portability remain later packages in the active
Local-first Full Release.
Offline mutation synchronization, collaboration, and premium/billing paths remain excluded. See
[docs/SCOPE.md](docs/SCOPE.md) for the exact target and
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the remaining P5-P7 order.

## Built with Codex and GPT-5.6

Codex materially supported competitor research synthesis, specification and architecture drafting,
modular implementation, and scope, authorization, timezone, accessibility, responsive-design,
dependency, and release audits. The owner approved the bounded product scope and the original
GetDesign-informed Editorial Focus baseline. Product capabilities remain in explicit feature
modules: manual workflows work without AI, task and schedule facts have one canonical
representation, and AI output is always reviewed before it can write.

GPT-5.6 powers the optional server-side planning proposal step. It converts a brain dump and selected task context into a schema-validated proposal; deterministic application code owns scheduling, ownership, conflicts, and atomic apply. Codex helped implement that boundary and its refusal, stale-data, no-write-before-apply, and idempotency tests. Git commits and the repository contracts preserve the concrete engineering and design decisions without maintaining a separate progress diary.

## Verification and deployment

Install Playwright Chromium once with `pnpm exec playwright install chromium`, then run `pnpm verify` for the canonical local gate. See:

- [Development setup](docs/SETUP.md) for host, PostgreSQL, Docker, health, and migration commands;
- [Railway deployment](docs/DEPLOYMENT.md) for the hosted web/PostgreSQL path and cost controls;
- [Friend test](docs/FRIEND_TEST.md) for the five-minute candidate checklist and feedback format.

For shared UI changes, run `pnpm verify:design` before `pnpm verify`. Repository-owned design tokens and contracts in [DESIGN.md](DESIGN.md) remain authoritative.

## Repository orientation

1. Read [AGENTS.md](AGENTS.md) for engineering and audit gates.
2. Read [docs/MANIFEST.md](docs/MANIFEST.md) for owners and canonical documents.
3. Use this README's **Implemented baseline** section to distinguish shipped behavior from the
   remaining plan, then read [docs/SCOPE.md](docs/SCOPE.md) before changing product behavior.
4. Use [docs/GOAL.md](docs/GOAL.md) and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for execution order.
5. Use [DESIGN.md](DESIGN.md) and its routed screen contracts for UI work.

## Independence and license

OpenTask is independent and is not affiliated with TickTick, Airbnb, or GetDesign. Competitor research informs capability coverage only; code, copy, assets, and visual identity must remain original.

The application is licensed under [AGPL-3.0-or-later](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before contributing or reporting a vulnerability.
