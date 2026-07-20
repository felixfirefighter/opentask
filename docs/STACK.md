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
| Desktop shell | Electron 43.1.1 + electron-builder 26.15.3 | Packages the existing Next.js server and supervises a per-user loopback PostgreSQL runtime for Windows/macOS. Development uses Docker; production uses staged, pinned native runtime trees. |

Next.js documents App Router as the current route model. Drizzle supports code-first PostgreSQL schemas and generated/applied migrations. Sources: [Next.js App Router](https://nextjs.org/docs/app), [Drizzle migrations](https://orm.drizzle.team/docs/migrations).

## Application and UI libraries

| Package | Approved use | Guardrail |
|---|---|---|
| Tailwind CSS | token-backed styling and responsive composition | No arbitrary raw colors in feature components. |
| shadcn/ui patterns + Radix primitives, CVA, clsx, tailwind-merge | accessible commodity controls and token-backed variants | Keep vendored components generic; feature behavior stays in modules. |
| Lucide React | original interface icon set | Never import competitor icons/assets. |
| Zod | request, environment, AI, and versioned document validation | One canonical schema per contract; infer types from it. |
| TanStack Query | client server-state cache, optimistic mutations, invalidation | Not a second domain store; server remains authoritative. |
| `@fullcalendar/react` v7 standard entrypoints | month/day/week/agenda and drag/resize | Use only bundled `/daygrid`, `/timegrid`, `/list`, and `/interaction` entrypoints; no premium Scheduler dependency. |
| `@dnd-kit/core` + sortable | accessible list/section reorder | Must configure keyboard sensor, instructions, and menu fallback. |
| `chrono-node` | English quick-add date/time recognition | Always show parsed tokens for confirmation. |
| `rrule` (not installed) | P2-gated, range-bounded recurrence expansion | No raw RRULE UI or direct presentation import. Installation is authorized only after the P2 dependency gate below passes. |
| `temporal-polyfill` | explicit date/time arithmetic used by FullCalendar/domain adapters | Do not use implicit server-local timezone arithmetic. |
| `date-fns` | display formatting and small date helpers | Temporal/domain value objects own scheduling semantics. |
| `react-markdown` + `remark-gfm` | safe Markdown task-description rendering | Raw HTML disabled; sanitize any future HTML path. |
| `fractional-indexing` | stable task/list sort keys | Rebalance through one application use case, not ad hoc updates. |
| `cmdk` and Sonner (through shadcn) | command palette and undo/error toast | No parallel custom implementations. |

FullCalendar's React standard package is MIT and supports React 17–19; its interaction API supports
event drag/resize. OpenTask's P2 recurrence policy and safety cap remain in a task-owned domain
wrapper rather than a FullCalendar plugin or presentation component. dnd-kit provides sortable
primitives and keyboard/accessibility hooks. Sources:
[FullCalendar React](https://fullcalendar.io/docs/react),
[event drag/resize](https://fullcalendar.io/docs/event-dragging-resizing),
[dnd-kit accessibility](https://docs.dndkit.com/guides/accessibility),
[Chrono](https://github.com/wanasit/chrono).

## Vendored font assets

P0.1 self-hosts two roman variable WOFF2 assets through the framework-bundled `next/font/local`;
there is no font runtime package, CDN request, or build-time network dependency. The shipped UI does
not require italics, so italic binaries are intentionally omitted.

| Asset | Purpose and range | Pinned source | License | SHA-256 |
|---|---|---|---|---|
| Inter Variable 4.1 | Working UI, available weight axis 100–900; product usage normally stays 400–600 | Official [`v4.1` release archive](https://github.com/rsms/inter/releases/tag/v4.1), `web/InterVariable.woff2` | SIL OFL 1.1; upstream notice committed beside the asset | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| EB Garamond Variable | GetDesign-recommended open-source display substitute; available weight axis 400–800 and product display usage stays at the genuine 400 endpoint | Official repository commit [`106a4a6`](https://github.com/octaviopardo/EBGaramond12/tree/106a4a6d377987459ae5e68673a4570f13b957fb), `fonts/webfonts/EBGaramond[wght].woff2` | SIL OFL 1.1; upstream notice committed beside the asset | `7667eac47b012e7f92c14e2ec8b41d3b850e1e8d49e0db45f7417517866fb78a` |

The source asset inventory and upstream notices live in `app/fonts/README.md` and
`app/fonts/licenses/`. The production image distributes the two notices at
`/app/licenses/fonts/Inter-OFL.txt` and `/app/licenses/fonts/EBGaramond-OFL.txt`; the Dockerfile uses
explicit source-to-runtime copies so the notices remain available even though source font files are
compiled into Next.js output. `pnpm check:licenses` enforces both mappings in addition to the source
asset hashes and notice contents. Replacing or subsetting either font is a font-asset dependency
change: pin the new source, retain the license, update the checksum and runtime copy mapping,
rebuild, and rerun visual/font-load evidence.

## Server, worker, and providers

| Package/system | Approved use | Guardrail |
|---|---|---|
| Better Auth with Drizzle adapter | internal server sessions and workspace ownership tables; no public credential UI | Domain authorization still belongs to application use cases. |
| `pg` | pooled PostgreSQL driver | One shared pool per process. |
| pg-boss | Existing worker scaffold; P6 reminder queue | Keep the queue boot/shutdown smoke through P5. P6 alone may activate notification jobs; do not move task, habit, Focus, or AI workflows into jobs. |
| `web-push` (not installed) | P6-gated browser notification delivery | Installation is authorized only after the P6 dependency gate below passes; VAPID/provider absence must remain a supported degraded state. |
| Official `openai` JavaScript SDK | Responses API for the optional planner | Server-only, `store:false`, structured outputs, minimal context. |
| Pino | structured application/worker logs | Mandatory redaction; no user content. |

Better Auth documents current Next.js integration and PostgreSQL/Drizzle support. pg-boss is PostgreSQL-backed and supports retries, cron, transactions, and a Drizzle adapter. OpenAI recommends Structured Outputs with native Zod support for schema adherence. Sources: [Better Auth + Next.js](https://better-auth.com/docs/integrations/next), [Better Auth installation](https://better-auth.com/docs/installation), [pg-boss](https://github.com/timgit/pg-boss), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#v1responses).

### Release-gated dependency decisions

The active release approves the capabilities below, not an unchecked package installation. Both
packages are absent from the current `package.json` and lockfile. The named work package must rerun
the dependency-change gate, choose and pin an exact version, review its resolved production tree,
update the license allowlist/notices, and add the resulting decision to the table of installed
dependencies in the same change. Until that gate passes, production code must not import the
package.

| Package gate | Purpose | Declared upstream license | Activation requirements |
|---|---|---|---|
| P2 — `rrule` | Standards-based expansion behind the tasks module's bounded recurrence wrapper; OpenTask still owns presets, IANA-time semantics, occurrence identity, and safety caps. | BSD-3-Clause | Verify the selected version/license and maintenance signal; pin it; add only a task-owned adapter; prove finite range/cap and DST fixtures. Do not expose arbitrary RRULE input. |
| P6 — `web-push` | Serialize and send standards-based Web Push messages behind the notifications provider port. | MPL-2.0 | Verify the selected version, license compatibility/notice obligations, type support, and maintenance signal; pin it; keep endpoint/key material server-only and encrypted; prove provider-absent, retry, revocation, and redaction paths. |

License sources:
[`rrule`](https://github.com/jakubroztocil/rrule/blob/master/LICENCE),
[`web-push`](https://github.com/web-push-libs/web-push/blob/master/LICENSE).

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
| Desktop release | `electron-builder` NSIS/DMG, staged Node 24 and relocatable PostgreSQL 17 runtime trees | Every runtime artifact needs an exact source, checksum, license notice, cold-start test, dynamic-library/share-data check, and platform signing/notarization review. |

Do not add Jest, Cypress, Prisma, tRPC, GraphQL, Redux, Redis, a second date library, a second
component system, or a second application/database implementation for desktop.

### Bootstrap dependency decisions

| Dependency | Uncovered capability | Cost | License | Maintenance signal | Owner |
|---|---|---|---|---|---|
| `eslint-plugin-boundaries` 7.0.2 | Resolve relative, alias, export, and dynamic imports before enforcing module/layer direction; core ESLint path patterns cannot do this reliably. | Development-only lint work; no application bundle or service. | MIT | Current v7 line, ESLint 9 compatible, with an active upstream release history. | `eslint.config.mjs` and `scripts/eslint/architecture-boundaries.mjs` |
| `next-devtools-mcp` 0.4.0 | Let future Codex tasks inspect the live Next.js route/build/runtime state through the framework-supported MCP bridge. | Development-only stdio process; optional and not required for app boot. | MIT | Exact package recommended by the official Next.js 16 MCP guide and pinned in the lockfile. | `.codex/config.toml`; no product adapter |
| `better-auth` + `@better-auth/drizzle-adapter` 1.6.23 | Provide the internal server session implementation and direct Drizzle/PostgreSQL adapter instead of maintaining session storage, cookie rotation, and expiry in product code. | Two pinned server dependencies; credential routes are not exposed through product UI and there is no browser SDK. | MIT | Reviewed stable release at initial identity implementation, with official Next.js, Drizzle, security, migration, and rate-limit documentation. | `modules/identity/infrastructure/authentication-gateway.ts` |
| `fractional-indexing` 4.0.0 | Generate stable sortable keys between neighboring task containers and rows without renumbering every mutation. | Zero transitive dependencies and one small server-side application adapter; bounded rebalance remains OpenTask policy. | CC0-1.0 | Active v4 release with built-in TypeScript declarations and a deliberately small API. | `modules/tasks/application/ranking.ts` |
| `@tanstack/react-query` 5.101.2 | Cache authorized task reads and coordinate optimistic mutation rollback/invalidation without creating a second domain store. | One client cache scoped to task presentation; PostgreSQL and application DTOs remain authoritative. | MIT | Current stable v5 release with React 19 support and documented optimistic rollback patterns. | `shared/presentation/AppClientProviders.tsx` and `modules/tasks/presentation/data/` |
| `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 + `@dnd-kit/utilities` 3.2.2 | Provide the required pointer, touch, and keyboard sortable task/checklist interactions with announcements. | Three small client packages; every drag action retains an explicit menu alternative and server-side rank validation. | MIT | Current mutually compatible releases with maintained keyboard/accessibility primitives. | `modules/tasks/presentation/TaskListSortContext.tsx`, `modules/tasks/presentation/TaskSectionSortContext.tsx`, `modules/tasks/presentation/TaskStepSortContext.tsx`, and `modules/tasks/presentation/navigation/TaskNavigationSortContext.tsx` |
| `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 | Render portable task Markdown with GFM semantics and raw HTML disabled. | Rendering-only dependency chain; no rich-text document model or HTML execution path. | MIT | Current stable releases with an AST-based default that does not execute raw HTML. | `modules/tasks/presentation/TaskNotesEditor.tsx` |
| `cmdk` 1.1.1 + Sonner 2.0.7 | Implement the required keyboard command palette plus actionable Undo/error notifications. | Client-only UI primitives; palette results remain API-authorized and persistent errors remain inline. | MIT | Current stable releases with React 19 support and maintained accessible interaction primitives. | `modules/tasks/presentation/TaskCommandPalette.tsx`, `modules/tasks/presentation/data/`, and `shared/presentation/AppClientProviders.tsx` |
| Radix Dialog 1.1.19 + Alert Dialog 1.1.19 + Dropdown Menu 2.1.20 | Supply focus-contained task/container forms, destructive confirmation, and keyboard-complete action menus. | Commodity interaction primitives styled exclusively through OpenTask tokens; no second design system. | MIT | Current stable Radix releases with React 19 compatibility and maintained ARIA behavior. | `modules/tasks/presentation/`, `modules/tasks/presentation/navigation/`, `modules/planning/presentation/ScheduleEditorDialog.tsx`, and `modules/identity/presentation/MobileMoreMenu.tsx` |
| `chrono-node` 2.10.0 | Parse English date/time suggestions during quick add without maintaining an error-prone natural-language parser. | Server/application adapter only; recognized source text remains visible and no parser result writes automatically. | MIT | Current stable v2 release with TypeScript declarations and focused locale parsers. | `modules/tasks/application/quick-add-application.ts` |
| `temporal-polyfill` 1.0.1 | Provide explicit IANA-zone date arithmetic and DST-safe conversions not available through the approved stack. | Loaded only by schedule/planning adapters; avoids implicit server-local `Date` calculations. | MIT | Current stable 1.0 release implementing the standardized Temporal API surface. | `modules/tasks/domain/schedule/` and `modules/planning/domain/` |
| `openai` 6.48.0 | Implement the optional GPT-5.6 Responses/Structured Outputs provider through the official SDK. | Server-only optional adapter; requests use minimal context, `store:false`, bounded timeout, and no-key capability fallback. | Apache-2.0 | Current stable official JavaScript SDK with maintained Responses and Zod helpers. | `modules/assistant/infrastructure/openai-responses-provider.ts` |
| `@fullcalendar/react` 7.0.1 | Provide the committed month, week, day, and agenda views plus pointer drag/resize through the v7 React package's standard subpath plugins. | Client-only calendar surface; keyboard/touch schedule forms remain canonical and no premium/resource package is installed. The exact package and its two official transitive v7 packages are lockfile-pinned and explicitly reviewed in `minimumReleaseAgeExclude` for the deadline build. | MIT | Current stable v7 React release, React 19 compatible, with view and interaction plugins consolidated into the connector package. | `modules/planning/presentation/FullCalendarView.tsx` |

### Direct runtime license baseline

`pnpm check:licenses` is authoritative for the resolved production tree. The direct-package baseline
for packages currently installed is:

- MIT: `@better-auth/drizzle-adapter`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@fullcalendar/react`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slot`, `@tanstack/react-query`, Better Auth, `chrono-node`, `clsx`, `cmdk`, Next.js, `pg`, pg-boss, Pino, React, React DOM, `react-markdown`, `remark-gfm`, Sonner, `tailwind-merge`, `temporal-polyfill`, and Zod.
- Apache-2.0: class-variance-authority, Drizzle ORM, and the official `openai` JavaScript SDK.
- ISC: Lucide React.
- CC0-1.0: `fractional-indexing`.

The production-tree license gate also permits reviewed permissive transitive families: MIT-0
(`@csstools` helpers), BlueOak-1.0.0 (`lru-cache` 11; its notice must remain with distributed
copies), and CC0-1.0 (`mdn-data`). These are compatible with the repository's AGPL distribution;
new license identifiers still fail the allowlist until reviewed.

The P2 `rrule` and P6 `web-push` candidates are intentionally absent from this baseline. Their
BSD-3-Clause and MPL-2.0 identifiers, respectively, must not be added to the executable allowlist
until the package-specific gate has reviewed the exact resolved version and notice obligations.

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
- No GraphQL/tRPC abstraction in the Local-first Full Release. A plain versioned API keeps future
  CLI/MCP/native clients possible without activating those Stage C clients now.

## Search and analytics

- PostgreSQL full-text/trigram search is sufficient for active scope. No Elasticsearch/Meilisearch.
- Active-release planning, habit, and Focus surfaces use accessible HTML/CSS/SVG primitives where a
  small visual summary is needed. Do not add a chart library unless a later approved scope change
  actually requires one; if it does, the default candidate is ECharts subject to its own gate.
- No third-party product analytics in the active release. Operational health comes from redacted logs and health checks.

## Deployment

### Canonical self-host path

One multi-stage Docker image retains two commands:

- web: production Next.js server
- worker: pg-boss entry point; boot/shutdown smoke through P5, active reminder delivery after P6

Docker Compose runs `web`, `worker`, and `postgres` for reproducibility. Web and PostgreSQL support
the manual product throughout implementation. P6 activates the worker for reminders; the final
self-host release rehearses all three processes. If the worker or VAPID configuration is absent,
reminders report a degraded state while tasks, planning, recurrence, habits, Focus, export, and
startup remain usable.

Local/self-host operation is the release completion path. No hosted deployment is required.

### Optional hosted demo

Railway remains an optional demo target because its official guides support a Next.js service,
PostgreSQL, a separate worker from the same codebase, private networking, and pre-deploy Drizzle
migrations. Hosted setup is not a P0-P8 completion gate. If used, configure a hard usage limit and
do not describe trial or usage-based hosting as permanently free. Sources:
[Railway Next.js + Postgres](https://docs.railway.com/guides/nextjs),
[full-stack worker pattern](https://docs.railway.com/guides/fullstack-nextjs),
[pricing](https://railway.com/pricing),
[cost control](https://docs.railway.com/pricing/cost-control).

## Deliberate omissions

- Supabase is not the application platform: it would duplicate Better Auth/provider choices and blur the self-host contract. PostgreSQL itself remains portable.
- Redis/BullMQ is unnecessary; PostgreSQL-backed pg-boss owns the one active reminder-job family
  after P6.
- A monorepo is unnecessary for one web product and one worker entrypoint sharing the same modules.
- Mobile/native framework expansion and offline synchronization remain outside active scope. The
  authorized Electron shell packages the existing server/database locally; it provides no sync
  protocol or remote-data cache.
- Rich-text editor frameworks are deferred; Markdown keeps task content portable and implementation bounded.

## Recommended agent tooling

These are development-time aids, not runtime dependencies and not permission to expose production data.

1. **Use the installed, pinned Next.js DevTools MCP for implementation diagnostics.** Next.js 16
   exposes a development MCP endpoint; the repository's reviewed `next-devtools-mcp` bridge lets an
   agent inspect live build/runtime errors, routes, metadata, logs, and browser state. It remains
   development-only and optional for product startup. Source:
   [official Next.js MCP guide](https://nextjs.org/docs/app/guides/mcp).
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
