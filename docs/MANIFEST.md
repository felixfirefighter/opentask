# Repository manifest

This file is the routing index and source-of-truth map. Keep it compact. Detailed rules belong in the linked document, not duplicated here.

## Canonical documents

| Concern | Source of truth |
|---|---|
| Agent behavior and hard gates | `AGENTS.md` |
| Implemented capabilities and local run path | `README.md` |
| Product purpose and principles | `docs/PRODUCT.md` |
| Active/rejected/later feature scope | `docs/SCOPE.md` |
| Goal-feature contract | `docs/GOAL.md` |
| Stack and approved dependencies | `docs/STACK.md` |
| System shape and layer rules | `docs/ARCHITECTURE.md` |
| Tables, ownership, data semantics | `docs/DATA_MODEL.md` |
| Ordered work packages | `docs/IMPLEMENTATION_PLAN.md` |
| Tests, audits, completion gates | `docs/QUALITY.md` |
| Design north star and routing | `DESIGN.md` |
| Approved visual baseline | `docs/design/editorial-focus.md` |
| Vendored font asset sources/notices | `app/fonts/README.md` and `docs/STACK.md` |
| Hackathon constraints/submission | `docs/HACKATHON.md` |
| Reproducible local/container setup | `docs/SETUP.md` |
| Hosted Railway deployment | `docs/DEPLOYMENT.md` |
| Friend candidate handoff | `docs/FRIEND_TEST.md` |
| Reference-only TickTick feature research | `docs/research/TICKTICK_FEATURES.md` |
| Research URLs and confidence | `docs/research/SOURCES.md` |

## Planned repository shape

```text
app/                     Next.js routes and composition only
modules/                 Product feature modules
  landing/                public landing presentation only
  identity/
  tasks/
  planning/
  habits/                 habit definitions, local-day logs, and projections
  focus/                  authoritative timer sessions and summaries
  notifications/          task reminders, push subscriptions, and delivery worker
  assistant/
  portability/
shared/                  Approved stable cross-cutting surfaces
worker/                  pg-boss runtime; zero-job baseline until P6 activates reminder jobs
drizzle/                 Generated, committed SQL migrations
public/                  Original static assets
docs/                    Product and engineering contracts
tests/                   Cross-module integration and E2E support
```

Each module may contain `presentation`, `application`, `domain`, and `infrastructure` directories only when that layer is needed. A module exposes application service contracts through `modules/<name>/index.ts`; that root cannot export domain, presentation, or infrastructure code. Next route composition uses the exact `modules/<name>/presentation/index.ts` UI entry.

## Module ownership

| Module | Owns | Contract |
|---|---|---|
| landing | public landing presentation and original product preview | `docs/modules/landing.md` |
| identity | session context, user preferences, account bootstrap | `docs/modules/identity.md` |
| tasks | folders, lists, sections, tasks, schedules, tags, checklist, search | `docs/modules/tasks.md` |
| planning | smart views, calendar projections, Eisenhower rules, deterministic scheduler | `docs/modules/planning.md` |
| habits | habit definitions, schedules, logs, Today/history/streak projections | `docs/modules/habits.md` |
| focus | authoritative timer policy, completed sessions, and derived summaries | `docs/modules/focus.md` |
| notifications | task reminders, push subscriptions, queue jobs, and Web Push delivery | `docs/modules/notifications.md` |
| assistant | OpenAI adapter, extraction, planner proposals, review/apply | `docs/modules/assistant.md` |
| portability | versioned user export and future import adapters | `docs/modules/portability.md` |

## Approved shared surfaces

- `shared/presentation`: shadcn primitives, generic layout primitives, generic hooks.
- `shared/design`: tokens and theme plumbing.
- `shared/auth`: provider-neutral actor/session contracts and authentication errors; no provider
  implementation or feature authorization policies.
- `shared/db`: connection, transaction type, schema aggregation, and generic entity-ID generation
  only.
- `shared/logging`: structured logger and redaction.
- `shared/config`: server/worker environment validation; no feature settings.
- `shared/health`: liveness/readiness policies; no feature status aggregation.
- `shared/http`: stable transport error envelopes and generic request-boundary primitives; no
  feature DTOs.
- `shared/time`: generic clocks, Temporal setup, and generic instant/local-date conversions.
- `shared/validation`: generic pagination, ID, and canonical IANA timezone schemas only.

Anything else requires updating this manifest with a concrete reason.

## Stable command surface

These commands are the stable repository interface; contributors use them rather than inventing alternatives.

| Command | Contract |
|---|---|
| `pnpm dev` | web app in development |
| `pnpm worker` | pg-boss worker; architecture smoke before P6 and active reminder jobs after P6 |
| `pnpm db:up` / `pnpm db:down` | local PostgreSQL lifecycle |
| `pnpm db:generate` | generate migration from reviewed schema change |
| `pnpm db:migrate` | apply committed migrations |
| `pnpm db:seed` | idempotent database seed-readiness/connectivity check; writes no user or demo records |
| `pnpm lint` | static lint |
| `pnpm format:check` | deterministic formatting gate |
| `pnpm test:boundaries` | executable negative architecture-boundary probe |
| `pnpm check:docs` | local Markdown and manifest-route reference audit |
| `pnpm check:schema` | exact migrated application table/column and Drizzle-composition inventory |
| `pnpm typecheck` | strict TypeScript |
| `pnpm test` | unit tests |
| `pnpm test:db` | database integration tests |
| `pnpm test:e2e` | Playwright golden paths |
| `pnpm test:a11y` | automated accessibility checks |
| `pnpm test:production` | already-started production Compose health/process/signal smoke |
| `pnpm verify:design` | design literal and browser-computed component contracts |
| `pnpm build` | production build |
| `pnpm verify` | full required local gate |
| `pnpm check:secrets` | tracked and non-ignored repository-file secret-pattern scan |
| `pnpm check:licenses` | reviewed production dependency-license inventory |

## Documentation maintenance

- Update a source-of-truth document only when its contract changes.
- Do not copy the same rule into multiple documents; link to the owner.
- Do not store progress history in docs. A temporary current-work note, if ever needed, is replaced rather than appended and is deleted at release.
- New module contracts belong in `docs/modules/`; new screen contracts belong in `docs/design/screens/`.
- A later-roadmap contract is not permission to create its routes, tables, jobs, dependencies, or UI
  under the active goal. Active modules still follow the package order and cannot expose dormant
  later-package code before their gate.
- Architecture deviations use one short ADR in `docs/decisions/` and a manifest entry. Do not create ADRs for routine implementation choices.
