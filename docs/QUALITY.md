# Quality and audit contract

No work package or release is complete because the happy path was demonstrated once. This document defines the evidence required to sign off the Hackathon Release.

## Verification commands

WP00 must make these commands stable. Later work changes their internals only when this contract changes.

| Loop | Commands | When |
|---|---|---|
| Fast | `pnpm lint && pnpm typecheck && pnpm test --changed` or owning test file | after each coherent edit |
| Module | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db` with owning filters where supported | before package handoff |
| Browser | `pnpm test:e2e && pnpm test:a11y` | after a user flow or shared UI change |
| Build | `pnpm build` | after route/env/build-system changes and before handoff |
| Full | `pnpm verify` | before feature freeze and final release |

`pnpm verify` must fail on any required lint, type, unit, database integration, E2E, accessibility, migration, or production-build failure. It must not skip a gate merely because a provider key is absent; provider-live smoke is a separately recorded manual gate.

## Test architecture

### Unit and property tests

Own pure behavior close to the module:

- task state transitions, parent-depth, rank generation, and parser confirmation;
- schedule value objects, recurrence bounds, local-day/DST conversion, and Matrix classification;
- habit eligibility, current/best streak, and numeric aggregation;
- focus duration/state transitions;
- reminder eligibility/version checks;
- free-interval and deterministic planner scheduling;
- strict Zod contracts, export versions, and problem-code mapping.

Freeze clocks and timezones explicitly. No test may rely on the developer machine's local timezone, current date, random ordering, or a live model response.

### Component tests

Use Testing Library at the user-interaction boundary. Cover:

- semantic names, descriptions, validation, focus movement, and keyboard activation;
- loading, empty, success, validation, conflict, provider failure, offline, and permission-denied states;
- optimistic rollback and announced status changes;
- quick-add token confirmation and task inspector forms;
- timer reconstruction and proposal diff editing.

Do not assert implementation details, generated class strings, or snapshots of large DOM trees.

### Database integration tests

Run against real PostgreSQL, not an in-memory substitute. Cover:

- foreign keys, checks, uniqueness, partial indexes, transactions, and concurrent writes;
- every user-owned repository with positive owner and negative cross-user cases;
- account bootstrap, task status/reorder, recurring completion, reminder scheduling, habit log uniqueness, one active timer, planner apply, and export;
- idempotency keys and optimistic versions;
- soft-delete visibility and restore;
- migration from an empty database and the seeded previous schema state.

Tests create isolated users/data and clean only their known test scope. They do not rely on suite order.

### End-to-end tests

Playwright projects:

- `desktop-chromium`: 1440×900;
- `tablet-chromium`: 1024×768 for shell-collapse smoke;
- `touch-tablet-chromium`: 1024×768 with a coarse pointer for target-size contracts;
- `mobile-chromium`: 390×844;
- `boundary-768-chromium` and `boundary-320-chromium`: design-contract-only breakpoint boundary checks;
- one focused WebKit smoke for authentication, quick add, Calendar display, and focus timer if time permits after required Chromium gates.

Run the five golden paths on desktop and mobile. Keep selectors semantic (`role`, `label`, visible name) or stable user-facing test IDs only when semantics cannot identify repeated items.

Provider-independent tests mock at the module port using recorded schema-valid fixtures. A live OpenAI/push smoke is required before release but never makes CI nondeterministic.

## Five golden paths

### G1 — First run and core task loop

1. Create an account or enter a fresh isolated demo.
2. Confirm Inbox/default preferences exist.
3. Quick-add a naturally dated task and inspect the editable parsed value.
4. Add priority, Markdown description, tag, checklist item, and subtask.
5. Organize it into a folder/list/section and reorder through keyboard-accessible controls.
6. Find it through search, complete it, undo, cancel, and restore as applicable.
7. Sign out; protected data is no longer reachable.

Forced variants: invalid input, stale update, network mutation failure, offline write attempt, and User B guessing User A's IDs.

### G2 — Plan across time

1. Create all-day and timed tasks in the configured timezone.
2. Create supported recurring tasks and complete/skip only the current occurrence.
3. See the same records in Today, Upcoming, month, week/day, agenda, and Matrix projections.
4. Drag/resize one calendar task, then change another through the non-drag date/time form.
5. Change priority/schedule from Matrix and confirm every projection updates.

Forced variants: DST fixture, schedule conflict, unsupported recurrence, range boundary, and empty calendar.

### G3 — Build and execute routines

1. Create boolean and numeric habits with two supported schedules.
2. Check in/edit/undo/skip; confirm Today, streak, strip, and heat map.
3. Start a task-linked Pomodoro, pause, refresh, resume, and finish.
4. Start/finish a stopwatch and inspect/correct recent totals.
5. Archive a habit and complete the linked task; history remains readable.

Forced variants: duplicate check-in, concurrent timer start, clock skew, abandoned tab/reconnect, and cross-user history access.

### G4 — Reminder, installation, and ownership

1. Configure a task schedule and one browser reminder.
2. Subscribe, deliver through the worker, and record the outcome exactly once.
3. Change/cancel the task and prove the stale job does not deliver.
4. Install/open the PWA shell, go offline, and see writes disabled honestly.
5. Export the account and validate the versioned JSON.

Forced variants: permission denied, unsupported push, missing worker/configuration, duplicate job, revoked endpoint, offline API attempt, and second-user data in export.

### G5 — Reality-aware plan

1. Paste a brain dump, choose existing unscheduled tasks, and set window/duration/buffer.
2. Generate a strict proposal with estimates, constraints, rationale, and uncertainty.
3. Show an impossible/overflow item without illegal placement.
4. Edit/deselect actions and inspect before/after values.
5. Apply explicitly and confirm one atomic, idempotent update across task/calendar projections.

Forced variants: no API key, refusal, timeout, malformed output, irrelevant input, unknown/cross-user record, stale proposal, duplicate apply, and concurrent task change. Every failure before apply must produce zero domain writes.

## Acceptance evidence matrix

Each row needs a named automated test or manual evidence link before final sign-off.

| Scope area | Required evidence |
|---|---|
| Identity/first run | auth integration, bootstrap transaction, two-user denial, desktop/mobile shell audit |
| Task/organization | domain + database/API suites, parser fixtures, G1, schema inventory |
| Planning surfaces | time/recurrence/Matrix tests, range query review, G2, keyboard drag alternative |
| Habits | schedule/streak fixtures, uniqueness/ownership integration, G3 |
| Focus | concurrency/time authority tests, reconnect E2E, G3 |
| AI planner | eval fixtures, no-write/apply authorization tests, G5, one live smoke |
| PWA/reminders/export/demo | worker/cache/export tests, G4, fresh-clone and hosted smoke |

## Mandatory release audits

### 1. Scope audit

- Diff every visible route, table, dependency, and job against `docs/SCOPE.md` and module contracts.
- Confirm every committed capability is reachable and every explicit non-goal is absent or only named in roadmap docs.
- Confirm no paywall/quota/billing path and no feature requires OpenAI.
- Confirm copy does not claim full parity, native/offline-write support, guaranteed push, or cost-free hosting.

Failure condition: unapproved feature, missing acceptance mapping, or misleading claim.

### 2. Architecture and modularity audit

- Run boundary lint and search for forbidden deep module imports.
- Confirm `app/*` composes modules and contains no Drizzle queries/business rules.
- Confirm domain code imports no React, Next, Drizzle, queue, or provider package.
- Inspect files above the preferred limits in `AGENTS.md`; split by responsibility or document the focused exception.
- Search for catch-alls such as generic `utils`, `helpers`, `service`, shared feature widgets, duplicate DTOs, or parallel state stores.
- Confirm each cross-module import uses the owning module's public surface.

Failure condition: bypassed layer, ambiguous ownership, duplicated domain rule, or unjustified oversized catch-all.

### 3. Schema and migration audit

- Print table/column/index/constraint ownership and compare with `docs/DATA_MODEL.md`.
- Search canonical vocabulary before accepting every new field.
- Confirm screen projections do not have tables or duplicate task date/status fields.
- Confirm JSONB appears only in the whitelist and is versioned/Zod-validated.
- Review generated SQL; `drizzle-kit push` is never the release migration path.
- Apply all migrations to an empty database and the seeded prior revision; verify rollback/restore plan for any destructive operation.
- Inspect high-value query plans for user/range/status indexes and N+1 behavior.

Failure condition: synonymous column, generic metadata/EAV, missing constraint/index, unreviewed migration, or data-loss path.

### 4. Authentication and authorization audit

- Test unauthenticated access to every protected page/API.
- Run cross-user denial for lists, tasks, checklist, tags, schedules, reminders, subscriptions, habits/logs, focus, proposals, and export.
- Ensure nested IDs are validated through an owned parent, not independently trusted.
- Review demo/reset isolation, session cookies, origin/CSRF behavior, rate limits, logout cache clearing, and reauthentication expectations.
- Confirm errors do not reveal whether another user's identifier exists.

Failure condition: any horizontal/vertical access, cookie-only authorization, or shared demo data leak.

### 5. Input, output, and web security audit

- Strict Zod validation rejects unknown keys and unsafe sizes at every external boundary.
- Review Markdown/XSS fixtures, URL handling, SQL parameterization, CSP/security headers, CORS/origin, and safe redirects.
- Verify secrets remain server-side and absent from client bundles, Git, seed, logs, health, export, screenshots, and errors.
- Run production dependency audit and manually review high/critical findings plus direct dependency licenses.
- Confirm rate limits/abuse bounds for auth, search, export, push subscription, and AI generation/apply.

Failure condition: exploitable input/output, secret exposure, unresolved applicable critical/high advisory, or incompatible license.

### 6. Privacy and logging audit

- Logs include request/job identifiers and stable error codes, not titles, descriptions, brain dumps, emails, sessions, tokens, endpoints, or push keys.
- AI receives only explicitly selected task context and uses `store: false`.
- Export contains all and only the owner's release data; health contains no configuration detail.
- No third-party analytics or tracking request is present.
- Privacy-facing copy explains optional provider processing and real infrastructure/API costs accurately.

Failure condition: unnecessary content leaves the boundary or appears in logs/telemetry.

### 7. Time, recurrence, and numerical audit

- Run tests in UTC, America/New_York, and Asia/Singapore process/browser contexts.
- Cover DST gap/fold, midnight, month end, leap day where supported, week-start preference, and overdue/24-hour Matrix boundaries.
- Confirm date-only values never pass through midnight UTC and timed values retain IANA display context.
- Confirm recurrence expansion and calendar queries are range-bounded.
- Verify focus totals and habit numeric quantities use consistent precision and server authority.

Failure condition: timezone-dependent result, unbounded expansion, shifted all-day date, duplicated occurrence, or client-controlled duration.

### 8. AI safety and correctness audit

- Validate structured output again after the provider boundary; handle refusal separately from invalid output.
- Confirm the model cannot choose trusted IDs or action types outside the allowlist.
- Inspect proposal diff, uncertainty, overflow, edit/deselect, stale detection, ownership, idempotency, and atomic apply.
- Prove generation and every pre-apply failure make no domain writes.
- Run deterministic fixtures plus one live smoke; never record provider output containing personal data as a committed fixture.

Failure condition: autonomous write, hidden change, illegal schedule, stale overwrite, content over-sharing, or AI-only core path.

### 9. Accessibility audit

- Automated axe has no serious/critical violations on every active screen/state.
- Keyboard-only audit covers navigation, quick add, forms, dialogs, command palette, reorder, calendar edit alternative, Matrix actions, habit check-in, timer, and proposal review.
- Screen-reader spot-check covers landmarks, page title, names/descriptions, validation, optimistic/loading announcements, timer semantics, and charts/table alternatives.
- Contrast, non-color cues, visible focus, 200%/400% zoom, reduced motion, target sizes, and logical reading order meet `docs/design/accessibility.md`.

Failure condition: blocked keyboard path, trapped/lost focus, unlabeled control, color-only meaning, inaccessible drag-only action, or serious/critical axe issue.

### 10. Responsive and visual audit

- Capture each screen's default, empty, loading, error, offline, and permission state where applicable.
- Inspect at 1440×900, 1024×768, 768×1024, 390×844, and 320×568; include long content and browser zoom.
- Compare with screen contracts for shell behavior, hierarchy, spacing, tokens, inspector/drawer behavior, and mobile keyboard safe areas.
- For changed shared components, run the computed-style contract suite and record expected token versus actual typography, spacing, row size, and action target size. A screenshot alone is not conformance evidence.
- Confirm no raw feature colors, copied competitor trade dress, horizontal page overflow, obscured action, clipped calendar, or layout shift that blocks use.

Failure condition: contract mismatch that harms comprehension/action, overflow, hidden focus, or unoriginal/copycat presentation.

### 11. Reliability, PWA, worker, and performance audit

- Rehearse database/provider/worker unavailable, network slow/offline, duplicate request/job, refresh during timer, and reconnect.
- Inspect service-worker cache: no authenticated API/auth response or personal data in Cache Storage.
- Verify stale reminder version no-ops and queue retry/retention are bounded.
- Confirm health/readiness behavior and graceful web operation without worker/OpenAI/push.
- Check production bundle/routes and representative list/calendar query latency with seeded data; eliminate obvious N+1/unbounded queries.

Failure condition: data corruption, duplicate effective side effect, false offline claim, personal cache leak, crash loop, or unbounded work.

### 12. Reproducibility, documentation, and submission audit

- Follow README from a fresh clone with only documented tools and `.env.example`.
- Start web/worker/database, migrate, seed, run tests/build, and create/export an account.
- Verify Docker Compose and hosted deployment use committed migrations and pinned dependencies.
- Check all documentation links, commands, env names, license/security notes, known limitations, demo URL, and release commit.
- Complete every item in `docs/HACKATHON.md` and open public assets in a signed-out browser.

Failure condition: hidden setup step/service, broken command/link, mutable unpinned release, inaccessible submission, or missing license.

## Manual visual evidence format

Store only release evidence, not an implementation diary. A release evidence index may map:

```text
acceptance/golden-path ID → test name or screenshot/video timestamp → commit
```

Screenshots must use deterministic seed data and contain no personal information. Delete obsolete evidence rather than accumulating versions.

## Defect policy

| Severity | Definition | Release rule |
|---|---|---|
| Blocker | data/security/privacy loss, cross-user access, cannot start/build/migrate, core demo impossible | must fix |
| Critical | active acceptance failure, autonomous/incorrect AI write, inaccessible primary action, recurrence/reminder corruption | must fix |
| Major | important recovery/responsive path broken with a documented workaround | fix before submission unless the written contract already declares the limitation |
| Minor | cosmetic issue that does not impair action or trust | may document only after all gates pass |

Do not downgrade a defect because the deadline is close. A scope cut requires the user-authorized scope-change protocol.

## Final sign-off

The final auditor must report:

- release commit and environment;
- exact commands run with results;
- all twelve audit results;
- golden-path results at required widths;
- live OpenAI/push and hosted-demo smoke results or explicit provider limitation;
- applicable dependency/license findings;
- remaining contract-permitted limitations.

Sign-off is denied if any blocker/critical defect, failed required command, unmapped acceptance criterion, or unchecked mandatory audit remains.
