# Implementation plan

This is the complete ordered delivery plan for the Hackathon Release. It is a dependency plan, not a status log. Scope lives in `docs/SCOPE.md`; verification lives in `docs/QUALITY.md`.

## Time contract

The plan uses a maximum **67 hours to a deployable feature-complete build** and protects the final **13 hours** for audit, repair, recording, and submission. If less than 80 hours remain when implementation starts, preserve the final 13-hour release window and compress package timeboxes; do not silently remove acceptance criteria.

| Window | Outcome |
|---|---|
| H0–H4 | Repository can build, test, migrate, and enforce boundaries |
| H4–H11 | Identity, data foundation, and responsive shell work |
| H11–H22 | Task domain and APIs are complete |
| H22–H31 | Core task experience is end-to-end usable |
| H31–H40 | Scheduling, recurrence, Calendar, and Matrix work |
| H40–H47 | Habits and Focus work |
| H47–H53 | Reminders, PWA boundary, and export work |
| H53–H60 | AI proposal/review/apply path works |
| H60–H67 | Integration, seed, landing, deployment, and feature-complete gate |
| H67–H80 | Feature freeze, full audit, fixes, video, and submission |

Timeboxes are ceilings and prioritization signals, not permission to waive gates. Parallel work is allowed only when file ownership does not overlap and contracts are already stable.

## VP0 — User-approved visual proof gate

VP0 runs before the main implementation goal and stops for explicit user approval. It reorders presentation work already budgeted across WP00, WP01, WP03, WP04, and WP07; it does not add hours or features to the 67-hour plan.

Allowed output:

- the approved Next.js presentation scaffold, semantic tokens, generic primitives, and responsive shell;
- fixture-driven Landing, Today, Calendar, Task details, and AI Review surfaces;
- deterministic local sample data and development-only fixture routing;
- basic local-only interactions needed to judge hierarchy and responsive behavior;
- desktop, mobile, and representative dark-theme screenshots plus visual/accessibility audit evidence.

Forbidden output:

- database/schema/migrations, authentication implementation, APIs, persistence, OpenAI/provider calls, workers, reminders/push, deployment, or complete CRUD behavior;
- screens, features, or dependencies outside the approved stack and five named surfaces;
- continuing into WP00 or the main implementation goal after evidence delivery without explicit user approval.

Exit gate:

- all five surfaces render at 1440×900 and 390×844 with deterministic fixtures;
- task selection/details, Calendar view switching, and planner proposal selection are locally demonstrable;
- lint, typecheck, focused tests, production build, keyboard smoke, automated accessibility scan, computed-style design contract, and contract-based visual audit pass or disclose exact residual issues;
- deliver evidence and stop for user approval.

## Work-package protocol

For every package:

1. Read its owning module, screen, data, and design contracts.
2. Restate the package boundary in the active goal; do not expand it.
3. Write or update tests with the behavior, not in a later cleanup batch.
4. Keep changes small enough to audit; prefer vertical slices over disconnected scaffolding.
5. Run the fast loop (`pnpm lint`, `pnpm typecheck`, relevant tests) after coherent slices.
6. Run the package gate below before starting a dependent package.
7. Update current-truth documentation only if an approved contract actually changed.

## WP00 — Repository and contract bootstrap (H0–H4)

### Purpose

Create a reproducible, guarded foundation before feature code can diverge.

### Deliverables

- Initialize Git and the single pnpm package with pinned Node/pnpm metadata and strict TypeScript.
- Scaffold Next.js App Router, Tailwind, repository-owned design tokens, generic shadcn/Radix primitives, and an empty responsive app shell.
- Add Dockerfile and Docker Compose services for web, worker, and PostgreSQL.
- Add environment validation and `.env.example` with placeholders only.
- Configure Drizzle, migration directories, PostgreSQL test isolation, and seed entrypoint.
- Configure ESLint import boundaries, Prettier, Vitest, Testing Library, Playwright, axe, and GitHub Actions.
- Create every stable command promised by `docs/MANIFEST.md`, including `pnpm verify`.
- Add health/readiness endpoints that check process state and database connectivity without leaking configuration.
- Add Pino redaction defaults and a stable problem-details error envelope.
- Add the intended AGPL-3.0-or-later license, `SECURITY.md`, and contribution/setup skeleton; confirm the final product name before public submission.
- Add a dependency/license inventory command or documented release check.

### Guardrails

- No empty feature abstractions or speculative tables.
- No feature package may query Drizzle from `app/*`.
- CI uses the same commands developers use locally.
- The worker must boot with zero registered jobs before notification work begins.

### Exit gate

- Fresh install, PostgreSQL startup, empty migration, unit runner, E2E smoke page, production build, web health, and worker boot all pass.
- A deliberate forbidden deep import fails lint.
- Secret scan of tracked files is clean.

## WP01 — Data foundation, identity, and shell (H4–H11)

### Purpose

Establish account isolation, preferences, default data, and the navigation frame used by every later slice.

### Deliverables

- Implement Better Auth email/password tables, handlers, sign-up, sign-in, sign-out, and protected app routing.
- Add `user_preferences` with versioned Zod parsing for timezone, week start, clock, theme, and reduced motion.
- Implement an idempotent account bootstrap transaction that creates the immutable Inbox and default preferences.
- Implement an isolated demo-entry/reset flow without published credentials or cross-visitor state.
- Add actor/session resolution used by application use cases; cookie presence alone is not authorization.
- Add schema aggregation and shared transaction/time/ID primitives without feature rules.
- Implement auth screens and the responsive shell: desktop rail/sidebar/content/inspector regions and mobile content/bottom navigation/detail route.
- Implement light/dark/system themes, skip link, focus treatment, loading boundary, error boundary, and offline banner shell state.

### Required tests

- Sign-up bootstrap is atomic and idempotent.
- Missing/invalid sessions are denied.
- User A cannot read/update User B preferences or Inbox.
- IANA timezone and preference values reject invalid input; stale preference versions return conflict.
- Auth and shell keyboard order work at desktop and mobile widths.

### Exit gate

- A fresh account lands in its own Inbox; two-user denial suite passes.
- Shell screenshots at 1440×900, 1024×768, and 390×844 have no overflow or inaccessible control.

## WP02 — Task domain, persistence, and API (H11–H22)

### Purpose

Complete the authoritative task model before building projections and advanced surfaces.

### Deliverables

- Add reviewed migrations for folders, lists, sections, tasks, checklist items, tags, and task-tag joins exactly as modeled.
- Implement domain rules for status transitions, one-level full-feature subtasks, immutable Inbox behavior, ranks, folder/list/task soft delete/restore, empty-section deletion, and version increments.
- Implement scoped repositories and application use cases for folder/list/section/task/checklist/tag CRUD.
- Implement complete, undo, cancel, restore, move, and reorder transactions.
- Generate fractional ranks through one shared task use case and implement bounded rebalance.
- Implement explicit strict Zod request/response schemas and `/api/v1` route adapters.
- Add client mutation/idempotency keys for retried creates and row versions for updates.
- Add user-scoped title/description/tag search with the documented PostgreSQL indexes.
- Return stable problem codes for validation, not-found-within-scope, conflict, and invariant errors.

### Required tests

- Pure status/parent/depth/rank rules.
- Empty and seeded migration application.
- Cross-user denial for every aggregate and nested path, including guessed IDs.
- Inbox cannot be deleted/moved into an invalid state.
- Checklist and subtask semantics remain distinct.
- Stale versions produce 409 and never overwrite current data.
- Repeated idempotency key cannot create a duplicate.
- Soft-deleted rows do not appear in active queries and can be restored by their owner.
- Search cannot leak another user's text or tags.

### Exit gate

- Domain, database integration, authorization, migration, and API contract suites pass.
- A schema inventory matches `docs/DATA_MODEL.md`; no generic metadata or duplicate schedule/status concept exists.

## WP03 — Core task experience (H22–H31)

### Purpose

Turn the task engine into the fast, responsive daily workflow used in the demo.

### Deliverables

- Implement Inbox, Today, Upcoming, and Completed/Cancelled navigation with shared query keys and range-bounded results.
- Build task row, quick-add composer, task inspector/full-screen mobile detail, list/section controls, tag/priority/date controls, checklist, and subtask UI.
- Add safe Markdown description editing/rendering with raw HTML disabled.
- Add English Chrono quick parsing; show recognized schedule tokens and keep original title text editable before save.
- Add optimistic create/edit/complete/move/reorder with rollback, undo toast, and visible conflict recovery.
- Implement dnd-kit pointer/touch/keyboard reorder and equivalent Move actions through menus.
- Implement global command palette for destination navigation, user-scoped search, and quick add.
- Add loading skeletons, actionable empty states, recoverable errors, permission/offline behavior, and destructive confirmations defined by screen contracts.

### Required tests

- Golden path: quick add → inspect → organize → complete → undo.
- Parser fixtures prove text is not silently removed or misapplied.
- Optimistic rejection and version-conflict recovery restore authoritative state.
- Keyboard-only and touch alternatives can perform every reorder/move action.
- Markdown/XSS fixtures render safely.
- Long titles, empty descriptions, large lists, and mobile virtual keyboard do not break layout.

### Exit gate

- The non-calendar core loop is demonstrable at desktop and mobile widths with network throttling and one forced conflict.
- Task screen component, accessibility, and visual checks pass.

## WP04 — Schedule, recurrence, Calendar, and Matrix (H31–H40)

### Purpose

Add time-aware planning as projections over the same task truth.

### Deliverables

- Add reviewed schedule, recurrence, and occurrence-event migrations.
- Implement discriminated all-day/timed schedule values and explicit IANA timezone conversions.
- Implement supported recurrence presets only: daily, weekdays, weekly selected days, and monthly day-of-month.
- Implement bounded occurrence expansion, complete/skip current occurrence, and series editing rules.
- Implement range-bounded Calendar query and FullCalendar month, week/day, and agenda adapters.
- Implement drag/resize updates with optimistic version checks plus date/time forms for keyboard/touch parity.
- Implement Today/Upcoming projections using the user's local-day boundaries.
- Implement the derived Eisenhower Matrix and accessible actions to change priority/schedule.
- Ensure Calendar, smart views, Matrix, and inspector never persist duplicate task facts.

### Required tests

- Date-only tasks do not shift with UTC or browser timezone changes.
- Timed tasks round-trip through stored instants and display timezone.
- DST spring-forward/fall-back fixtures cover local-day queries and recurrence.
- Completing/skipping one occurrence does not complete or corrupt the series.
- Recurrence expansion is range-bounded and rejects unsupported rules.
- Calendar drag conflict rolls back; the form alternative reaches the same mutation.
- Matrix quadrants match the documented priority/24-hour rules at boundaries.

### Exit gate

- Golden path: schedule a task on Calendar → see it in Today/Matrix → complete the occurrence.
- Query-plan/index review shows no unbounded history load or per-row recurrence query.

## WP05 — Habits and Focus (H40–H47)

### Purpose

Deliver the two execution/consistency modules without coupling their state to tasks.

### Deliverables

- Add habit, habit schedule, habit log, and focus-session migrations.
- Implement boolean/numeric habits with daily, selected-weekday, and target-per-week schedules.
- Implement check-in, quantity/note edit, undo, skip, unachieved, archive, and restore.
- Implement deterministic current/best streak, seven-day strip, and compact monthly heat-map projections.
- Integrate due habits into Today without converting them to task rows.
- Implement Pomodoro and stopwatch start/pause/resume/finish/discard using server timestamps and one-active-timer enforcement.
- Link an optional task or habit by stable identity; preserve readable historical context after completion/archive.
- Implement preferences, today's/seven-day totals, recent history, and owner corrections/deletion.

### Required tests

- At most one effective habit log per local date.
- Every supported habit schedule has streak boundary fixtures, including timezone/DST cases.
- Archive hides active projection but retains history.
- Two concurrent timer starts cannot create two active sessions.
- Refresh/reconnect reconstruction and client clock skew do not alter authoritative duration.
- Cross-user denial covers all habit and focus mutations/history.

### Exit gate

- Habit check-in and task-linked focus demo paths pass at both target widths.
- Projection calculations are pure/unit-tested and database invariants pass under concurrency.

## WP06 — Reminders, PWA boundary, and export (H47–H53)

### Purpose

Add reliable browser reminders and honest portability/platform behavior.

### Deliverables

- Add reminder, encrypted push subscription, and delivery-attempt migrations.
- Implement one absolute or start-relative reminder per task and validated job scheduling/cancellation in the owning transaction.
- Register pg-boss worker handlers that reload reminder/version, no-op stale jobs, retry with bounds, and record idempotent delivery outcome.
- Implement web-push subscribe/revoke, permission education, invalid-subscription cleanup, and content-free redacted logs.
- Add web manifest and service worker for static/app-shell assets only; exclude auth and user API data from HTTP cache.
- Detect offline state and disable domain writes with a truthful banner; do not queue writes.
- Implement versioned, schema-validated JSON export of all active-release user-owned data.
- Add UI states for missing VAPID configuration, missing worker, denied permission, unsupported browser, and failed delivery.

### Required tests

- Reminder create/update/delete schedules or cancels the correct versioned job.
- Duplicate worker execution causes at most one recorded effective delivery.
- Stale, deleted, completed, or unauthorized jobs no-op safely.
- Logs never contain task content, session/token, endpoint, or push key material.
- Service worker does not cache authenticated API/auth responses and domain writes are blocked offline.
- Export validates against its versioned schema and contains only the requesting user's complete release data.

### Exit gate

- Worker integration test and a supported-browser manual push smoke pass.
- Installability, offline disclosure, cache inspection, and export audit pass.

## WP07 — Reality-aware AI planner (H53–H60)

### Purpose

Showcase GPT-5.6 where it adds leverage while preserving deterministic control and a fully useful non-AI product.

### Deliverables

- Implement server-only OpenAI Responses adapter with `gpt-5.6`, `store: false`, timeout, bounded retries, and structured output parsed by the canonical Zod proposal schema.
- Minimize selected context and exclude unselected task/user content.
- Implement extraction for proposed tasks, constraints, durations, priority, deadlines, rationale, and uncertainty; model output never supplies trusted IDs.
- Implement deterministic free-interval calculation and scheduler with work window, buffer, fixed blocks, overflow, and overlap checks.
- Persist an expiring proposal snapshot with source record IDs/versions and no model secrets.
- Build input/select/configure, generating, review-diff, error/refusal, stale, no-key, and applied states.
- Implement editable/deselectable actions and explicit apply endpoint that re-fetches, authorizes, validates, and commits atomically with an idempotency key.
- Allow create/clarify/prioritize/schedule/defer only; reject delete/complete/cancel/share/notify effects.

### Required tests

- Golden eval fixtures: vague input, multiple tasks, fixed appointment, overflow, impossible constraint, irrelevant input, refusal, timeout, and malformed result.
- Deterministic scheduler property/boundary tests prove no overlap or out-of-window placement.
- Missing key leaves the rest of the product functional and explains setup.
- Proposal generation performs no domain writes.
- Unknown IDs, cross-user IDs, stale versions, invalid action types, duplicate apply, and concurrent changes are rejected or idempotent.
- Minimal-context/logging snapshot contains no unrelated content.

### Exit gate

- Brain dump → typed proposal → visible warning/edit → explicit atomic apply passes with recorded fixture and live-provider smoke.
- Forced refusal, timeout, and stale proposal visibly recover with zero writes.

## WP08 — Product integration and deployable release candidate (H60–H67)

### Purpose

Make all modules feel like one original product and establish a stable release candidate before feature freeze.

### Deliverables

- Build original landing/onboarding and polished empty states that communicate self-hosting and optional AI accurately.
- Create deterministic, idempotent demo seed data covering every video story beat without real personal data.
- Complete cross-module Today composition, navigation counts, error boundaries, responsive transitions, and reduced-motion behavior.
- Add production Docker build, migration/predeploy path, Railway web/worker/database configuration, health probes, and hard cost controls.
- Complete README quickstart, environment/provider setup, worker limitations, export notes, and demo instructions.
- Add CI release workflow and capture the release commit/migration inventory.
- Run all golden paths once on local production build and once on the hosted candidate.

### Required tests

- Fresh-clone setup and clean migration/seed rehearsal.
- Full E2E suite at desktop and mobile projects.
- OpenAI-disabled, push-denied, worker-down, offline, and database-unavailable disclosures.
- Production security-header, cookie, cache, health, and log-redaction smoke.
- Seed/reset is isolated and repeatable.

### Exit gate

- Hosted feature-complete candidate is healthy and reproducible.
- No active-scope acceptance criterion lacks mapped evidence.
- Feature freeze begins; no roadmap or cosmetic dependency work may start.

## Release window — freeze, audit, repair, submit (H67–H80)

### H67–H71: full audit

- Run the entire `docs/QUALITY.md` sign-off matrix: scope, schema, boundaries, migrations, auth, security, privacy, time, recurrence, reminders, AI, accessibility, responsive visuals, PWA, reliability, dependency/license, deploy, and documentation.
- Record evidence against acceptance IDs, not an informal “looks good” statement.

### H71–H75: defect repair and regression

- Fix release-blocking defects only, smallest safe change first.
- Re-run the owning package gate and all affected golden paths after every fix.
- Do not weaken a test to make a failure disappear.

### H75–H78: submission assets

- Record and caption the primary/backup demo takes.
- Capture clean desktop/mobile screenshots, final description, architecture/GPT-5.6 explanation, repository link, live URL, and `/feedback` session ID.
- Tag or record the exact release commit after final verification.

### H78–H80: submit and re-verify

- Submit before the deadline buffer closes.
- Open every public link in a clean browser, verify demo health and repository access, and save confirmation.
- Make only a critical fix after submission; if changed, re-run impacted gates and update the submitted URL/commit where allowed.

## Critical path and parallel lanes

The critical path is:

```text
bootstrap → identity/schema → task engine → schedule/recurrence
          → task/calendar UX → integrated release → audit/submission
```

Safe parallel lanes after their dependencies stabilize:

- Habits and Focus can proceed independently after WP01.
- Reminder worker mechanics can begin after task schedule/reminder contracts are frozen in WP04.
- AI extraction fixtures and deterministic scheduler can be developed independently, then integrated after task/schedule application APIs stabilize.
- Landing copy, seed story, and video outline can proceed without changing feature contracts.

Do not parallel-edit shared schema aggregators, root tokens, route maps, or migrations without one owner coordinating the merge.

## Traceability

| Active capability | Owning package | Primary evidence |
|---|---|---|
| Auth, preferences, first run | WP01 | identity integration + two-user denial E2E |
| Organization/task lifecycle/search | WP02–WP03 | domain/DB/API suites + core-loop E2E |
| Quick add and command palette | WP03 | parser fixtures + keyboard E2E |
| Schedule/recurrence/smart views | WP04 | DST/occurrence tests + planning E2E |
| Calendar and Matrix | WP04 | range/API tests + drag/form/keyboard E2E |
| Habits | WP05 | streak fixtures + check-in E2E |
| Focus | WP05 | concurrency/time tests + reconnect E2E |
| Push reminder | WP06 | worker integration + manual browser smoke |
| PWA/offline disclosure | WP06 | install/cache/offline audit |
| JSON export | WP06 | schema + ownership integration tests |
| AI proposal/review/apply | WP07 | eval fixtures + no-write/apply/stale E2E |
| Demo/deployment/self-host | WP08 | fresh clone + production/hosted smoke |

## Risk register

| Risk | Earliest signal | Containment already in plan |
|---|---|---|
| Recurrence/timezone defects | DST fixture fails | narrow preset set; Temporal domain wrapper; range-bound expansion |
| Calendar library integration consumes time | first adapter slice exceeds WP04 half-time | use standard views only; preserve form scheduling and acceptance contract |
| Push unavailable in judge browser | permission/provider smoke fails | honest degraded state; demo over supported HTTPS browser; core does not depend on push |
| AI latency/refusal/schema failure | fixture/live smoke fails | typed refusal/error states; deterministic fixtures; app remains useful without AI |
| Scope creep from parity research | proposed work has no active acceptance item | scope lock and five-step user-authorized change protocol |
| Schema duplication | inventory shows synonymous fields | placement test, module ownership, generated migration review |
| Cross-user leak | denial test fails | scoped repositories, actor required, deny suite blocks package completion |
| Deployment/provider failure | health/predeploy rehearsal fails | Docker Compose is canonical; keep local production demo and reproducible setup |
| Final-hour regression | full audit starts late | feature-complete gate at H67 and protected 13-hour freeze |

## Definition of plan completion

The plan is executed only when the completion definition in `docs/GOAL.md` is satisfied. Finishing H80, exhausting a token budget, or producing a demo video does not override a failed release gate.
