# Approved technology stack

The stack favors one language, one database, few operational services, strong schemas, and common libraries that AI agents can reason about. Versions are pinned in `package.json`/lockfile during bootstrap; major lines below are architectural choices.

## Core platform

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js 24 LTS | Current LTS, compatible with the selected framework and pg-boss; one server runtime. |
| Language | TypeScript, strict mode | Shared contracts across browser, server, worker, and tests. |
| Package manager | pnpm 11.14.0, Corepack-pinned | Deterministic, fast, single lockfile. |
| Web framework | Next.js 16 App Router, Node runtime | Full-stack React, route handlers, and one deployable web service. Do not use Edge runtime for DB/auth paths. |
| UI runtime | React 19 | Framework-supported client/server component model. |
| Database | PostgreSQL 17 for local/self-host baseline | Durable relational invariants, search, queue, and migrations in one service. Hosted deployments may use a compatible newer supported major after verification. |
| ORM/migrations | Drizzle ORM + Drizzle Kit | SQL-visible, modular TypeScript schemas, committed generated migrations. |
| Local services | Docker Compose | Reproducible PostgreSQL without proprietary local tooling. |

Next.js documents App Router as the current route model. Drizzle supports code-first PostgreSQL schemas and generated/applied migrations. Sources: [Next.js App Router](https://nextjs.org/docs/app), [Drizzle migrations](https://orm.drizzle.team/docs/migrations).

## Application and UI libraries

| Package | Approved use | Guardrail |
|---|---|---|
| Tailwind CSS | token-backed styling and responsive composition | No arbitrary raw colors in feature components. |
| shadcn/ui patterns + Radix primitives, CVA, clsx, tailwind-merge | accessible commodity controls and token-backed variants | Keep vendored components generic; feature behavior stays in modules. |
| Lucide React | original interface icon set | Never import competitor icons/assets. |
| Zod | request, environment, AI, and versioned document validation | One canonical schema per contract; infer types from it. |
| React Hook Form | non-trivial settings/task/planner forms | Simple one-field quick add can use local state. |
| TanStack Query | client server-state cache, optimistic mutations, invalidation | Not a second domain store; server remains authoritative. |
| `@fullcalendar/react` v7 standard entrypoints | month/day/week/agenda and drag/resize | Use only bundled `/daygrid`, `/timegrid`, `/list`, and `/interaction` entrypoints; no premium Scheduler dependency. |
| `@dnd-kit/core` + sortable | accessible list/section reorder | Must configure keyboard sensor, instructions, and menu fallback. |
| `chrono-node` | English quick-add date/time recognition | Always show parsed tokens for confirmation. |
| `rrule` | deferred recurrence expansion | Do not install or import under the active core; reconsider only through the scope-change protocol. |
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
| pg-boss | zero-job worker architecture scaffold | Keep the existing boot smoke; no active-core job or queue behavior. |
| `web-push` | deferred browser notification delivery | Do not install or import under the active core. |
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
| `better-auth` + `@better-auth/drizzle-adapter` 1.6.23 | Provide the approved email/password session implementation and direct Drizzle/PostgreSQL adapter instead of maintaining credential storage, cookie rotation, and session expiry in product code. | Two pinned server dependencies; the minimal server entry excludes unused auth plugins and there is no browser SDK. | MIT | Current stable release when WP01 began, with official Next.js, Drizzle, security, migration, and rate-limit documentation. | `modules/identity/infrastructure/authentication-gateway.ts` |
| `fractional-indexing` 4.0.0 | Generate stable sortable keys between neighboring task containers and rows without renumbering every mutation. | Zero transitive dependencies and one small server-side application adapter; bounded rebalance remains OpenTask policy. | CC0-1.0 | Active v4 release with built-in TypeScript declarations and a deliberately small API. | `modules/tasks/application/ranking.ts` |
| `@tanstack/react-query` 5.101.2 | Cache authorized task reads and coordinate optimistic mutation rollback/invalidation without creating a second domain store. | One client cache scoped to task presentation; PostgreSQL and application DTOs remain authoritative. | MIT | Current stable v5 release with React 19 support and documented optimistic rollback patterns. | `modules/tasks/presentation/task-query-client.tsx` |
| `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 + `@dnd-kit/utilities` 3.2.2 | Provide the required pointer, touch, and keyboard sortable task/checklist interactions with announcements. | Three small client packages; every drag action retains an explicit menu alternative and server-side rank validation. | MIT | Current mutually compatible releases with maintained keyboard/accessibility primitives. | `modules/tasks/presentation/reorder/` |
| `react-hook-form` 7.82.0 | Coordinate the non-trivial task inspector and container forms while preserving failed/conflicting input. | Client-only form state; Zod/application validation remains authoritative and quick add stays local-state only. | MIT | Current stable release supporting React 19 and uncontrolled native inputs. | `modules/tasks/presentation/task-detail/` |
| `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 | Render portable task Markdown with GFM semantics and raw HTML disabled. | Rendering-only dependency chain; no rich-text document model or HTML execution path. | MIT | Current stable releases with an AST-based default that does not execute raw HTML. | `modules/tasks/presentation/task-detail/TaskMarkdown.tsx` |
| `cmdk` 1.1.1 + Sonner 2.0.7 | Implement the required keyboard command palette plus actionable Undo/error notifications. | Client-only UI primitives; palette results remain API-authorized and persistent errors remain inline. | MIT | Current stable releases with React 19 support and maintained accessible interaction primitives. | `modules/tasks/presentation/command/` and `modules/tasks/presentation/TaskToastHost.tsx` |
| Radix Dialog 1.1.19 + Alert Dialog 1.1.19 + Dropdown Menu 2.1.20 | Supply focus-contained task/container forms, destructive confirmation, and keyboard-complete action menus. | Commodity interaction primitives styled exclusively through OpenTask tokens; no second design system. | MIT | Current stable Radix releases with React 19 compatibility and maintained ARIA behavior. | `modules/tasks/presentation/primitives/` |
| `chrono-node` 2.10.0 | Parse English date/time suggestions during quick add without maintaining an error-prone natural-language parser. | Server/application adapter only; recognized source text remains visible and no parser result writes automatically. | MIT | Current stable v2 release with TypeScript declarations and focused locale parsers. | `modules/tasks/application/quick-add/` |
| `temporal-polyfill` 1.0.1 | Provide explicit IANA-zone date arithmetic and DST-safe conversions not available through the approved stack. | Loaded only by schedule/planning adapters; avoids implicit server-local `Date` calculations. | MIT | Current stable 1.0 release implementing the standardized Temporal API surface. | `modules/tasks/domain/schedule/` and `modules/planning/domain/` |
| `openai` 6.48.0 | Implement the optional GPT-5.6 Responses/Structured Outputs provider through the official SDK. | Server-only optional adapter; requests use minimal context, `store:false`, bounded timeout, and no-key capability fallback. | Apache-2.0 | Current stable official JavaScript SDK with maintained Responses and Zod helpers. | `modules/assistant/infrastructure/openai-responses-provider.ts` |
| `@fullcalendar/react` 7.0.1 | Provide the committed month, week, day, and agenda views plus pointer drag/resize through the v7 React package's standard subpath plugins. | Client-only calendar surface; keyboard/touch schedule forms remain canonical and no premium/resource package is installed. The exact package and its two official transitive v7 packages are lockfile-pinned and explicitly reviewed in `minimumReleaseAgeExclude` for the deadline build. | MIT | Current stable v7 React release, React 19 compatible, with view and interaction plugins consolidated into the connector package. | `modules/planning/presentation/calendar/` |

### Direct runtime license baseline

`pnpm check:licenses` is authoritative for the resolved production tree. The direct-package baseline is:

- MIT: `@better-auth/drizzle-adapter`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@fullcalendar/react`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slot`, `@tanstack/react-query`, Better Auth, `chrono-node`, `clsx`, `cmdk`, Next.js, `pg`, pg-boss, Pino, React, React DOM, React Hook Form, `react-markdown`, `remark-gfm`, Sonner, `tailwind-merge`, `temporal-polyfill`, and Zod.
- Apache-2.0: class-variance-authority, Drizzle ORM, and the official `openai` JavaScript SDK.
- ISC: Lucide React.
- CC0-1.0: `fractional-indexing`.

The production-tree license gate also permits reviewed permissive transitive families: MIT-0
(`@csstools` helpers), BlueOak-1.0.0 (`lru-cache` 11; its notice must remain with distributed
copies), and CC0-1.0 (`mdn-data`). These are compatible with the repository's AGPL distribution;
new license identifiers still fail the allowlist until reviewed.

The current production audit reports one moderate advisory in `esbuild` 0.18.20, reached only
through Better Auth's Drizzle Kit tooling branch. The affected capability is an opt-in esbuild
development server; OpenTask's production web, migration, and worker commands do not import or
start it. There is no high/critical advisory and this moderate finding is not applicable to the
deployed runtime path. Re-evaluate it whenever Better Auth or its dependency graph changes.

## API style

- Versioned internal JSON endpoints under `/api/v1` for domain reads/mutations; Better Auth owns `/api/auth/*`.
- Route handlers validate Zod DTOs and call application use cases. They do not contain business logic or Drizzle queries.
- Mutations include the last-seen row `version`; stale writes return HTTP 409 with current metadata.
- Client-generated UUID/idempotency keys protect retried creates and planner apply.
- Server Components may call application queries directly when no client refresh is required; they still do not query Drizzle from `app/*`.
- No GraphQL/tRPC abstraction in the hackathon release. A plain versioned API keeps future CLI/MCP/native clients possible.

## Search and analytics

- PostgreSQL full-text/trigram search is sufficient for active scope. No Elasticsearch/Meilisearch.
- Active-core planning surfaces use accessible HTML/CSS/SVG primitives where a small visual summary is needed. Do not add a chart library until a later approved feature actually requires one; if it does, the default is ECharts.
- No third-party product analytics in the active release. Operational health comes from redacted logs and health checks.

## Deployment

### Canonical self-host path

One multi-stage Docker image retains two commands:

- web: production Next.js server
- worker: zero-job pg-boss architecture smoke

Docker Compose runs `web`, `worker`, and `postgres` for reproducibility. The friend-test and hosted active core require only `web` and `postgres`; the worker has no product job.

### Hackathon demo

Railway is the recommended demo target because its official guides support a Next.js service, PostgreSQL, a separate worker from the same codebase, private networking, and pre-deploy Drizzle migrations. Configure a hard usage limit. Railway currently has a trial/free entry and usage-based paid plans; do not describe hosted operation as permanently free. Sources: [Railway Next.js + Postgres](https://docs.railway.com/guides/nextjs), [full-stack worker pattern](https://docs.railway.com/guides/fullstack-nextjs), [pricing](https://railway.com/pricing), [cost control](https://docs.railway.com/pricing/cost-control).

## Deliberate omissions

- Supabase is not the application platform: it would duplicate Better Auth/provider choices and blur the self-host contract. PostgreSQL itself remains portable.
- Redis/BullMQ is unnecessary; the retained pg-boss scaffold has no active-core jobs.
- A monorepo is unnecessary for one web product and one worker entrypoint sharing the same modules.
- Native/mobile frameworks and installable PWA behavior are outside active scope; the responsive web app proves the product first.
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
