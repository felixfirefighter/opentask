# Approved technology stack

The stack favors one language, one database, few operational services, strong schemas, and common libraries that AI agents can reason about. Versions are pinned in `package.json`/lockfile during bootstrap; major lines below are architectural choices.

## Core platform

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js 24 LTS | Current LTS, compatible with the selected framework and pg-boss; one server runtime. |
| Language | TypeScript, strict mode | Shared contracts across browser, server, worker, and tests. |
| Package manager | pnpm 11.14.0, Corepack-pinned | Deterministic, fast, single lockfile. |
| Web framework | Next.js 16 App Router, Node runtime | Full-stack React, route handlers, PWA manifest support, one deployable web service. Do not use Edge runtime for DB/auth paths. |
| UI runtime | React 19 | Framework-supported client/server component model. |
| Database | PostgreSQL 17 for local/self-host baseline | Durable relational invariants, search, queue, and migrations in one service. Hosted deployments may use a compatible newer supported major after verification. |
| ORM/migrations | Drizzle ORM + Drizzle Kit | SQL-visible, modular TypeScript schemas, committed generated migrations. |
| Local services | Docker Compose | Reproducible PostgreSQL without proprietary local tooling. |

Next.js documents App Router as the current route model and provides an official PWA guide. Drizzle supports code-first PostgreSQL schemas and generated/applied migrations. Sources: [Next.js App Router](https://nextjs.org/docs/app), [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [Drizzle migrations](https://orm.drizzle.team/docs/migrations).

## Application and UI libraries

| Package | Approved use | Guardrail |
|---|---|---|
| Tailwind CSS | token-backed styling and responsive composition | No arbitrary raw colors in feature components. |
| shadcn/ui patterns + Radix primitives, CVA, clsx, tailwind-merge | accessible commodity controls and token-backed variants | Keep vendored components generic; feature behavior stays in modules. |
| Lucide React | original interface icon set | Never import competitor icons/assets. |
| Zod | request, environment, AI, and versioned document validation | One canonical schema per contract; infer types from it. |
| React Hook Form | non-trivial settings/task/habit forms | Simple one-field quick add can use local state. |
| TanStack Query | client server-state cache, optimistic mutations, invalidation | Not a second domain store; server remains authoritative. |
| FullCalendar standard React v7 packages | month/day/week/agenda and drag/resize | Standard MIT packages only; no premium Scheduler dependency. |
| `@dnd-kit/core` + sortable | accessible list/section reorder | Must configure keyboard sensor, instructions, and menu fallback. |
| `chrono-node` | English quick-add date/time recognition | Always show parsed tokens for confirmation. |
| `rrule` | supported recurrence expansion | Domain wrapper limits accepted rules to active scope. |
| `temporal-polyfill` | explicit date/time arithmetic used by FullCalendar/domain adapters | Do not use implicit server-local timezone arithmetic. |
| `date-fns` | display formatting and small date helpers | Temporal/domain value objects own scheduling semantics. |
| `react-markdown` + `remark-gfm` | safe Markdown task-description rendering | Raw HTML disabled; sanitize any future HTML path. |
| `fractional-indexing` | stable task/list sort keys | Rebalance through one application use case, not ad hoc updates. |
| `cmdk` and Sonner (through shadcn) | command palette and undo/error toast | No parallel custom implementations. |

FullCalendar's React standard package is MIT and supports React 17–19; its interaction API supports event drag/resize and it has an RRULE plugin. dnd-kit provides sortable primitives and keyboard/accessibility hooks. Sources: [FullCalendar React](https://fullcalendar.io/docs/react), [event drag/resize](https://fullcalendar.io/docs/event-dragging-resizing), [RRULE plugin](https://fullcalendar.io/docs/rrule-plugin), [dnd-kit accessibility](https://docs.dndkit.com/guides/accessibility), [Chrono](https://github.com/wanasit/chrono).

## Server, worker, and providers

| Package/system | Approved use | Guardrail |
|---|---|---|
| Better Auth with Drizzle adapter | email/password sessions and auth tables | Domain authorization still belongs to application use cases. |
| `pg` | pooled PostgreSQL driver | One shared pool per process. |
| pg-boss | reminder jobs, retries, cron maintenance | Separate worker entrypoint; no Redis. |
| `web-push` | standards-based browser notification delivery | Subscription endpoints encrypted at rest where provider allows; never log them. |
| Official `openai` JavaScript SDK | Responses API for the optional planner | Server-only, `store:false`, structured outputs, minimal context. |
| Pino | structured application/worker logs | Mandatory redaction; no user content. |

Better Auth documents current Next.js integration and PostgreSQL/Drizzle support. pg-boss is PostgreSQL-backed and supports retries, cron, transactions, and a Drizzle adapter. OpenAI recommends Structured Outputs with native Zod support for schema adherence. Sources: [Better Auth + Next.js](https://better-auth.com/docs/integrations/next), [Better Auth installation](https://better-auth.com/docs/installation), [pg-boss](https://github.com/timgit/pg-boss), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#v1responses).

## Quality toolchain

| Concern | Choice |
|---|---|
| Static quality | ESLint, Prettier, `tsc --noEmit` |
| Unit/component | Vitest, React Testing Library, user-event |
| DB integration | Vitest against isolated PostgreSQL test database/schema |
| End to end | Playwright |
| Automated accessibility | `@axe-core/playwright` plus keyboard tests |
| CI | GitHub Actions with PostgreSQL service container |
| Supply-chain check | `pnpm audit --prod` plus manual license inventory before release |

Do not add Jest, Cypress, Prisma, tRPC, GraphQL, Redux, Redis, a second date library, or a second component system.

### Bootstrap dependency decisions

| Dependency | Uncovered capability | Cost | License | Maintenance signal | Owner |
|---|---|---|---|---|---|
| `eslint-plugin-boundaries` 7.0.2 | Resolve relative, alias, export, and dynamic imports before enforcing module/layer direction; core ESLint path patterns cannot do this reliably. | Development-only lint work; no application bundle or service. | MIT | Current v7 line, ESLint 9 compatible, with an active upstream release history. | `eslint.config.mjs` and `scripts/eslint/architecture-boundaries.mjs` |
| `next-devtools-mcp` 0.4.0 | Let future Codex tasks inspect the live Next.js route/build/runtime state through the framework-supported MCP bridge. | Development-only stdio process; optional and not required for app boot. | MIT | Exact package recommended by the official Next.js 16 MCP guide and pinned in the lockfile. | `.codex/config.toml`; no product adapter |

### Direct runtime license baseline

`pnpm check:licenses` is authoritative for the resolved production tree. The direct-package baseline is:

- MIT: `@radix-ui/react-slot`, `clsx`, Next.js, `pg`, pg-boss, Pino, React, React DOM, `tailwind-merge`, and Zod.
- Apache-2.0: class-variance-authority and Drizzle ORM.
- ISC: Lucide React.

## API style

- Versioned internal JSON endpoints under `/api/v1` for domain reads/mutations; Better Auth owns `/api/auth/*`.
- Route handlers validate Zod DTOs and call application use cases. They do not contain business logic or Drizzle queries.
- Mutations include the last-seen row `version`; stale writes return HTTP 409 with current metadata.
- Client-generated UUID/idempotency keys protect retried creates and planner apply.
- Server Components may call application queries directly when no client refresh is required; they still do not query Drizzle from `app/*`.
- No GraphQL/tRPC abstraction in the hackathon release. A plain versioned API keeps future CLI/MCP/native clients possible.

## Search and analytics

- PostgreSQL full-text/trigram search is sufficient for active scope. No Elasticsearch/Meilisearch.
- Habit/focus visualizations use accessible HTML/CSS/SVG primitives for the small committed charts. Do not add a chart library until a later feature actually requires one; if it does, the default is ECharts.
- No third-party product analytics in the active release. Operational health comes from redacted logs and health checks.

## Deployment

### Canonical self-host path

One multi-stage Docker image with two commands:

- web: production Next.js server
- worker: pg-boss worker

Docker Compose runs `web`, `worker`, and `postgres`. The app can run without the worker, but reminder UI must disclose that delivery is unavailable.

### Hackathon demo

Railway is the recommended demo target because its official guides support a Next.js service, PostgreSQL, a separate worker from the same codebase, private networking, and pre-deploy Drizzle migrations. Configure a hard usage limit. Railway currently has a trial/free entry and usage-based paid plans; do not describe hosted operation as permanently free. Sources: [Railway Next.js + Postgres](https://docs.railway.com/guides/nextjs), [full-stack worker pattern](https://docs.railway.com/guides/fullstack-nextjs), [pricing](https://railway.com/pricing), [cost control](https://docs.railway.com/pricing/cost-control).

## Deliberate omissions

- Supabase is not the application platform: it would duplicate Better Auth/provider choices and blur the self-host contract. PostgreSQL itself remains portable.
- Redis/BullMQ is unnecessary because pg-boss covers the committed queue use case.
- A monorepo is unnecessary for one web product and one worker entrypoint sharing the same modules.
- Native/mobile frameworks are outside active scope; the responsive PWA proves the product first.
- Rich-text editor frameworks are deferred; Markdown keeps task content portable and implementation bounded.

## Recommended agent tooling

These are development-time aids, not runtime dependencies and not permission to expose production data.

1. **Install Next.js DevTools MCP before implementation.** Next.js 16 exposes a development MCP endpoint; the official `next-devtools-mcp` bridge lets an agent inspect live build/runtime errors, routes, metadata, logs, and browser state. This is the highest-value addition for an AI-driven Next.js repository. Pin/review the package during WP00 rather than allowing an unreviewed floating version in CI. Source: [official Next.js MCP guide](https://nextjs.org/docs/app/guides/mcp).
2. **Add the Better Auth documentation MCP while identity work is active.** Its remote documentation endpoint provides current auth setup/examples and reduces version-stale implementation guesses. It is documentation-only and must not be confused with adding an MCP server to this product. Source: [Better Auth documentation MCP](https://better-auth.com/docs/ai-resources/mcp).

The existing browser/testing tooling is sufficient for visual QA. Do not add a database MCP with broad write access, and do not install Figma merely to recreate the text design contract. If a Figma file later becomes the approved source of truth, its connector can be reconsidered under the scope/dependency gate.

## Dependency-change gate

For any new dependency, record:

1. the capability not covered by an approved package;
2. bundle/operational cost;
3. license;
4. maintenance signal;
5. exact module that owns its adapter.

If those answers are weak, do not add it.
