# Quality and audit contract

No work package or release is complete because the happy path was demonstrated once. This document defines the evidence required to sign off the Deadline-safe Hackathon Core.

## Verification commands

| Loop | Commands | When |
|---|---|---|
| Fast | `pnpm lint && pnpm typecheck && pnpm test --changed` or owning test file | after each coherent edit |
| Module | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db` with owning filters where supported | before worktree handoff |
| Browser | affected Playwright path plus `pnpm test:a11y` | after a user flow or shared UI change |
| Build | `pnpm build` | after route/env/build-system changes and before handoff |
| Full | `pnpm verify` | before engineering freeze and final release |

`pnpm verify` must fail on any required lint, type, unit, database integration, E2E, accessibility, migration, or production-build failure. It must not skip a gate because `OPENAI_API_KEY` is absent; the live-provider smoke is separately recorded.

Workers run focused checks in isolated worktrees. The integration owner runs database migrations, browsers, Docker, and full verification sequentially to avoid shared-resource collisions.

## Test architecture

### Unit and property tests

Own pure behavior close to the module:

- task state transitions, parent depth, rank generation, and parser confirmation;
- schedule value objects, local-day/DST conversion, and Matrix classification;
- free-interval and deterministic planner scheduling;
- strict Zod contracts, export versions, and problem-code mapping.

Freeze clocks and timezones explicitly. No test may rely on the developer machine's local timezone, current date, random ordering, or a live model response.

### Component tests

Use Testing Library at the user-interaction boundary. Cover semantic names, validation, focus movement, keyboard activation, loading/empty/error/offline/permission/conflict/provider states, optimistic rollback, quick-add token confirmation, task schedule editing, and proposal diff editing. Do not assert generated class strings or snapshots of large DOM trees.

### Database integration tests

Run against real PostgreSQL. Cover foreign keys, checks, uniqueness, transactions, concurrent writes, every active user-owned repository with positive owner and negative cross-user cases, account bootstrap, task status/reorder/schedule, planner apply, export, idempotency keys, optimistic versions, soft-delete/restore, and empty/seeded migration application.

### End-to-end tests

Required Playwright projects:

- `desktop-chromium`: 1440×900;
- `tablet-chromium`: 1024×768;
- `touch-tablet-chromium`: 1024×768 with a coarse pointer;
- `mobile-chromium`: 390×844;
- `boundary-768-chromium` and `boundary-320-chromium`: design-contract checks.

Run the four golden paths on desktop and mobile where the behavior is responsive. Keep selectors semantic or use stable user-facing test IDs only when semantics cannot identify repeated items. Provider-independent AI tests use recorded schema-valid fixtures; one live OpenAI smoke is required before release.

## Four golden paths

### G1 — First run and core task loop

1. Create an account or enter a fresh isolated demo.
2. Confirm Inbox/default preferences exist.
3. Quick-add a task and inspect it.
4. Add priority, Markdown description, tag, checklist item, and subtask.
5. Organize it into a folder/list/section and reorder through keyboard-accessible controls.
6. Find it through search, complete it, undo, cancel, and restore as applicable.
7. Sign out; protected data is no longer reachable.

Forced variants: invalid input, stale update, network mutation failure, offline write attempt, and User B guessing User A's IDs.

### G2 — Plan across time

1. Create all-day and timed tasks in the configured timezone, including natural-language quick add whose source text stays editable.
2. See the same records in Today, Upcoming, month, week/day, agenda, and Matrix projections.
3. Drag/resize one calendar task, then change another through the non-drag schedule form.
4. Change priority/schedule from Matrix and confirm every projection updates.

Forced variants: DST fixture, schedule conflict, range boundary, overlapping events, empty calendar, and unauthorized schedule access.

### G3 — Reality-aware plan

1. Paste a brain dump, choose existing unscheduled tasks, and set window/duration/buffer.
2. Generate a strict proposal with estimates, constraints, rationale, and uncertainty.
3. Show an impossible/overflow item without illegal placement.
4. Edit/deselect actions and inspect before/after values.
5. Apply explicitly and confirm one atomic, idempotent update across task/calendar projections.

Forced variants: no API key, refusal, timeout, malformed output, irrelevant input, unknown/cross-user record, stale proposal, duplicate apply, and concurrent task change. Every failure before apply must produce zero domain writes.

### G4 — Portability, demo isolation, and release trust

1. Reset a fresh isolated demo dataset and complete the G1–G3 story beats without shared credentials.
2. Export the account and validate the versioned JSON.
3. Lose connectivity in an already open page and verify writes are disabled without an offline-cache claim.
4. Sign out and confirm exported/private routes and records are inaccessible.
5. Repeat the hosted health, demo-reset, and critical path in a signed-out/clean browser.

Forced variants: export failure, second-user data fixture, database unavailable, missing OpenAI key, and duplicate demo reset.

## Acceptance evidence matrix

| Scope area | Required evidence |
|---|---|
| Identity/first run | auth integration, bootstrap transaction, two-user denial, desktop/mobile shell audit |
| Task/organization | domain + database/API suites, G1, schema inventory |
| Schedule/planning surfaces | time/Matrix tests, range query review, G2, keyboard drag alternative |
| AI planner | eval fixtures, no-write/apply authorization tests, G3, one live smoke |
| Export/demo/deployment | export ownership/schema tests, G4, fresh-clone and hosted smoke |

## Friend-candidate gate

Deferred extensions cannot be reconsidered until all of the following are true:

- a public candidate URL and health endpoint are reachable;
- isolated demo reset succeeds twice without cross-visitor state;
- G1–G4 pass once on the hosted candidate;
- desktop 1440 and mobile 390 primary screenshots are approved for usability;
- no blocker/critical defect or failed active-scope migration/build/auth check remains;
- a concise friend handoff includes URL, demo entry, five-minute test script, feedback format, and known limitations.

## Mandatory release audits

### 1. Scope and truth

- Diff every visible route, table, dependency, job, and claim against `docs/SCOPE.md`.
- Confirm recurrence, habits, Focus, reminders/push, service worker, and PWA installability are absent rather than half-exposed.
- Confirm no paywall/quota/billing path and no manual workflow requires OpenAI.

Failure: unapproved feature, missing acceptance mapping, dead control, or misleading claim.

### 2. Architecture and modularity

- Run boundary lint and search for forbidden deep imports.
- Confirm `app/*` has no Drizzle queries/business rules, domain code imports no framework/provider, and public module surfaces stay narrow.
- Inspect files above the preferred limits and remove dead code created by the scope cut.

Failure: bypassed layer, ambiguous ownership, duplicated rule, or unjustified catch-all.

### 3. Schema and migrations

- Compare active tables/columns/indexes/constraints with `docs/DATA_MODEL.md`; no heading marked Deferred may have a migration.
- Confirm projections do not store duplicate task date/status and JSONB appears only in the whitelist.
- Review generated SQL and apply all migrations to empty and seeded databases.
- Inspect task range/search queries for ownership, indexes, and bounded work.

Failure: deferred table, synonymous field, generic metadata/EAV, missing constraint/index, or unreviewed migration.

### 4. Authentication and authorization

- Test unauthenticated access to every protected page/API.
- Run cross-user denial for lists, tasks, checklist, tags, schedules, proposals, and export.
- Review demo/reset isolation, cookies, origin/CSRF behavior, rate limits, logout cache clearing, and existence-safe errors.

Failure: horizontal/vertical access, cookie-only authorization, or shared demo leak.

### 5. Security, privacy, and logging

- Strict Zod validation rejects unknown keys and unsafe sizes.
- Review Markdown/XSS, SQL parameterization, CSP/security headers, safe redirects, and client bundles for secrets.
- Logs contain request/use-case metadata, never titles, descriptions, brain dumps, emails, sessions, tokens, or model payloads.
- AI sends selected minimal context with `store: false`; export contains only owner data and no secrets.
- Run production dependency, license, and repository secret checks.

Failure: exploitable input/output, secret/content exposure, applicable unresolved high/critical advisory, or incompatible license.

### 6. Time and planning correctness

- Run schedule/smart-view/Matrix tests in UTC, America/New_York, and Asia/Singapore contexts.
- Cover DST gap/fold, midnight, month end, all-day exclusivity, timed timezone round-trip, and exactly-24-hour Matrix boundaries.
- Confirm date-only values never pass through midnight UTC and calendar queries are range-bounded.

Failure: timezone-dependent result, shifted all-day date, duplicated schedule fact, or unbounded query.

### 7. AI safety and correctness

- Validate Structured Output after the provider boundary and handle refusal separately.
- Confirm the model cannot choose trusted IDs or forbidden action types.
- Inspect proposal diff, uncertainty, overflow, edit/deselect, stale detection, ownership, idempotency, and atomic apply.
- Prove generation and every pre-apply failure make no domain writes; run deterministic fixtures plus one live smoke.

Failure: autonomous write, hidden change, illegal schedule, stale overwrite, or content over-sharing.

### 8. Accessibility and responsive visuals

- Automated axe has no serious/critical violations on every active screen/state.
- Keyboard-only audit covers navigation, quick add, forms, dialogs, command palette, reorder, calendar schedule alternative, Matrix actions, and proposal review.
- Inspect default, empty, loading, error, offline, permission/provider states at 1440×900, 1024×768, 768×1024, 390×844, and 320×568.
- Verify focus return, target sizes, 200% zoom, reduced motion, dark/light themes, computed design tokens, and no copied trade dress.

Failure: blocked path, inaccessible drag-only action, serious/critical axe issue, overflow, hidden focus, or harmful design-contract mismatch.

### 9. Reliability, reproducibility, and deployment

- Rehearse database/OpenAI/network unavailable, slow requests, duplicate mutations, optimistic conflicts, and retry paths.
- Follow README from a fresh clone: install, PostgreSQL, migrate, seed, web, tests/build, account, plan, and export.
- Boot the zero-job worker smoke, but do not expose or require a product job.
- Verify hosted health/readiness, security headers, demo isolation, migration/predeploy behavior, log redaction, and signed-out public access.

Failure: data corruption, duplicate effective write, hidden setup step, broken command/link, unhealthy candidate, or unreproducible demo.

## Defect policy

| Severity | Definition | Release rule |
|---|---|---|
| Blocker | data/security/privacy loss, cross-user access, cannot start/build/migrate, or core demo impossible | must fix |
| Critical | active acceptance failure, autonomous/incorrect AI write, or inaccessible primary action | must fix |
| Major | important recovery/responsive path broken with a documented workaround | fix before submission unless the written contract declares the limitation |
| Minor | cosmetic issue that does not impair action or trust | may document after all gates pass |

Do not downgrade a defect because the deadline is close. A scope cut requires the user-authorized scope-change protocol.

## Final sign-off

The final auditor reports the release commit/environment, exact commands and results, all nine audit results, G1–G4 at required widths, live OpenAI and hosted-candidate smoke, dependency/license findings, and remaining contract-permitted limitations.

Sign-off is denied if any blocker/critical defect, failed required command, unmapped acceptance criterion, or unchecked mandatory audit remains.
