# OpenTask (working title)

OpenTask is a self-hostable, open-source personal planning app for tasks, calendar planning, and an optional review-before-apply assistant. Core workflows remain useful without an AI key or paid feature tier.

The Deadline-safe Hackathon Core is implemented through the dependency-aware workstreams in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). The approved fixture-driven visual proof remains available while product infrastructure replaces it incrementally; it is not permission to add behavior outside [docs/SCOPE.md](docs/SCOPE.md).

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

The active core does not require a background worker; `pnpm worker` remains a zero-job architecture smoke. Install the Playwright browser once with `pnpm exec playwright install chromium`, then use `pnpm verify` for the complete local gate. See [docs/SETUP.md](docs/SETUP.md) for the reproducible setup, Docker path, health checks, and command contracts.

## Development-only visual proof routes

The pre-implementation proof remains available under `pnpm dev` while real product slices replace it. Except for
the real landing route, these fixture routes return not found from a production build and are never product data.

- `/` — landing and product composition
- `/today` — daily task workspace
- `/calendar` — Month, Week, Day, and Agenda views
- `/tasks/demo` — task detail and checklist inspector
- `/plan` — review-before-apply planning proposal

For shared UI changes, run `pnpm verify:design` before `pnpm verify`. Repository-owned design tokens and contracts in [DESIGN.md](DESIGN.md) remain authoritative.

## Repository orientation

1. Read [AGENTS.md](AGENTS.md) for engineering and audit gates.
2. Read [docs/MANIFEST.md](docs/MANIFEST.md) for owners and canonical documents.
3. Read [docs/SCOPE.md](docs/SCOPE.md) before changing product behavior.
4. Use [docs/GOAL.md](docs/GOAL.md) and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for execution order.
5. Use [DESIGN.md](DESIGN.md) and its routed screen contracts for UI work.

## Independence and license

OpenTask is independent and is not affiliated with TickTick, Airbnb, or GetDesign. Competitor research informs capability coverage only; code, copy, assets, and visual identity must remain original.

The application is licensed under [AGPL-3.0-or-later](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before contributing or reporting a vulnerability.
