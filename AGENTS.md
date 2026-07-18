# Agent operating contract

These rules are durable repository instructions for every human or AI contributor.

## Mandatory orientation

Before changing the repository:

1. Read `README.md`.
2. Read `docs/MANIFEST.md`.
3. Read `docs/SCOPE.md` and confirm the requested work is in the active release.
4. Read the task-relevant section of `docs/ARCHITECTURE.md`.
5. Read the relevant `docs/modules/*.md` contract.
6. For UI work, read `DESIGN.md` and only the routed design files for that screen.
7. For schema work, read `docs/DATA_MODEL.md` in full.

If documents conflict, precedence is: `AGENTS.md` -> `docs/SCOPE.md` -> `docs/ARCHITECTURE.md` -> module contract -> implementation. Stop and repair the conflict before coding.

## Scope control

- The active implementation goal is exactly the Hackathon Release in `docs/SCOPE.md` and `docs/GOAL.md`.
- A researched TickTick feature is not automatically approved for implementation.
- Post-hackathon features must not be started under the hackathon goal.
- Do not add a “small improvement” outside the active work package. Record it in the appropriate later-scope section only if it is materially useful.
- Do not silently cut a committed feature. A cut requires explicit user approval and an update to `docs/SCOPE.md` and `docs/GOAL.md` in the same change.
- Plans are maintained in place. Do not append status diaries, session logs, or implementation history to planning documents. Git is the history.

## Architecture boundaries

The product is a single TypeScript repository with feature modules under `modules/*`.

- `presentation`: Next routes, route handlers, client components, view models.
- `application`: use cases, authorization, orchestration, transactions, DTOs.
- `domain`: pure rules, policies, entities, value objects. No framework or database imports.
- `infrastructure`: Drizzle repositories, providers, queues, external APIs.

Allowed dependency direction:

- presentation -> application
- application -> domain
- application -> infrastructure

Forbidden without a documented exception:

- presentation -> infrastructure
- domain -> infrastructure/framework
- deep import into another module
- database access from `app/*` or a React component

Cross-module imports must use the target module's public `index.ts`. Shared code is limited to generic UI primitives, design tokens, auth/request context, database connection, logging, and truly generic utilities. Feature widgets and business rules never move to shared code merely because two files use them.

## File and API size

- One file owns one coherent responsibility.
- Target source files at 300 lines or fewer. At 400 lines, split by behavior unless doing so would create artificial indirection.
- Target React components at 200 lines or fewer; extract behavior hooks and subcomponents by responsibility.
- Do not create catch-all files named `utils.ts`, `helpers.ts`, `types.ts`, or a single global `schema.ts` containing every feature.
- Tests may be longer when a single behavior matrix remains clearer together, but split unrelated suites.
- Public module exports must be intentional and small. Do not export infrastructure internals.

## Data-model gate

Before adding a column or table:

1. Search existing schemas, migrations, DTOs, and `docs/DATA_MODEL.md` for the same semantic concept.
2. Identify the owning module and invariant.
3. Apply the placement test in `docs/DATA_MODEL.md`: scalar task property, repeating relation, history, provider data, or versioned document.
4. Update the canonical table dictionary in `docs/DATA_MODEL.md` in the same change.
5. Generate a reviewed SQL migration; never use schema push in shared or production environments.
6. Add authorization and migration tests.

Do not add generic JSONB, EAV/custom-field tables, duplicated status/date/owner columns, or a second representation of an existing concept. The only approved JSONB extension points are listed in `docs/DATA_MODEL.md` and must have a versioned Zod schema.

## Product and design rules

- Manual task workflows must function when `OPENAI_API_KEY` is absent.
- AI output never mutates data directly. It creates a proposal; a user reviews it; the server validates and applies it transactionally.
- Do not copy TickTick or Airbnb names, copy, screenshots, icons, proprietary fonts, or exact layouts.
- Components consume semantic design tokens, never raw color literals.
- Every drag interaction needs a keyboard/menu equivalent.
- Every committed screen implements default, empty, loading, error, and permission/offline states defined by its screen contract.

## Dependency policy

- Prefer the approved stack in `docs/STACK.md`.
- Do not install a new package until checking whether an approved package already solves the problem.
- A new runtime dependency requires its purpose and license to be added to `docs/STACK.md` in the same change.
- Pin the package manager and runtime; commit `pnpm-lock.yaml`.
- Avoid services that make self-hosting impossible. External providers must sit behind an interface with a self-hostable/default path.

## Security and privacy

- Every domain query is scoped by the authenticated user or explicit list membership.
- Never trust a user ID, ownership field, task ID, list ID, or AI proposal supplied by the client.
- Validate input at the presentation boundary with Zod and recheck domain invariants in application/domain code.
- Do not log task titles, descriptions, brain dumps, auth tokens, API keys, or push endpoints.
- OpenAI requests use `store: false`; send only the minimum selected task context.
- Secrets are server-only. No secret may use a `NEXT_PUBLIC_` prefix.

## Verification and audit

No work package is complete until its acceptance criteria and the relevant checks in `docs/QUALITY.md` pass.

At minimum before sign-off:

- format/lint and TypeScript checks
- unit tests for changed domain behavior
- database integration tests for changed persistence/authorization
- affected Playwright golden paths
- accessibility scan for changed screens
- responsive visual check at 1440, 1024, and 390 CSS px for UI work
- `pnpm verify:design` for every shared presentation, token, typography, spacing, radius, or target-size change
- self-review of the final diff for scope, boundary, schema, security, and dead-code issues

Never claim completion with skipped or failing required checks. Report the exact failure and its impact.
