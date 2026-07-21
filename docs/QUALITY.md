# Quality and audit contract

No package or release is complete because its happy path was demonstrated once. This document owns
the required evidence for the Local-first Full Release.

## Verification commands

| Loop | Commands | When |
|---|---|---|
| Fast | `pnpm verify:quick` or its affected checks plus owning focused tests | after each coherent edit |
| Module | lint, typecheck, owning unit/component/database tests | before lane handoff |
| Design | `pnpm verify:design` plus affected visual proof | every shared presentation/token/type/spacing/radius/target change |
| Browser | affected Playwright golden path plus `pnpm test:a11y` | after a committed user flow |
| Build | `pnpm build` | after route/env/build/service-worker changes and before handoff |
| Production | migration + web/worker/health/signal/PWA smoke | after schema, worker, Docker, or service-worker changes |
| Full | `pnpm verify` | at every package candidate and final release |

`pnpm verify` must fail on any required lint, type, unit, database, E2E, accessibility, migration,
worker, service-worker, or production-build failure added by the active package. Optional live OpenAI
and Web Push smokes are separately recorded because they require user-supplied configuration and
browser permission; deterministic/provider-degraded tests remain mandatory without those secrets.

Workers run focused checks in isolated worktrees. The integration owner runs shared database,
browser, Docker, worker, service-worker, and full gates centrally and sequentially.

## Test architecture

### Unit and property tests

Own pure behavior close to its module:

- task state/ranking/parser and schedule/timezone rules;
- recurrence preset validation, bounded expansion, and occurrence identity/effective state;
- habit schedule, quantity, local-day, streak, and heat-map projections;
- Focus transition, accumulated-duration, reconstruction, and summary-window policies;
- reminder eligibility, next-occurrence, deterministic idempotency, state shapes, exact retry/
  outcome-unknown, stale boundary, crash-lease, and retention policies;
- deterministic planner scheduling and strict versioned export/proposal contracts.

Freeze clocks, timezones, ranges, and ordering. No test may depend on the machine timezone, current
date, random order, live model output, wall-clock timer ticks, or real push delivery.

### Component tests

Use Testing Library at the interaction boundary. Cover semantic names, validation, focus, keyboard,
loading/empty/error/offline/permission/conflict/provider states, optimistic rollback, quick-add
confirmation, recurrence/occurrence actions, habit logs, Focus state controls, install/update state,
reminder permission/capability, and proposal diff editing. Do not assert generated class strings or
large DOM snapshots.

### Database integration tests

Use real PostgreSQL. Cover empty/upgrade migrations, constraints, indexes, transactions, concurrent
writes, and positive-owner/negative-cross-user cases for every user-owned aggregate. Specifically
prove occurrence uniqueness, one habit log per local day, one active Focus session, reminder/job
idempotency, global active endpoint ownership, encrypted subscription storage/key rotation,
transactional pg-boss insertion, atomic task/create-schedule/planner apply, and one consistent
authorized export snapshot.

### End-to-end and visual tests

Required projects remain:

- `desktop-chromium`: 1440×900;
- `tablet-chromium`: 1024×768;
- `touch-tablet-chromium`: 1024×768 coarse pointer;
- `mobile-chromium`: 390×844;
- `boundary-768-chromium` and `boundary-320-chromium` for design contracts.

Run each golden path on desktop/mobile when behavior is responsive. Use semantic selectors and
deterministic fixtures. Visual evidence waits for loaded fonts and keeps accessibility focus
evidence separate from presentation-clean comparison captures.

## Golden paths

### G1 — First run and core task loop

1. Create an account or enter a fresh isolated demo; Inbox/preferences exist.
2. Contextually quick-add and inspect a task.
3. Add priority, Markdown, tag, checklist item, subtask, organization, and schedule.
4. Reorder through keyboard-accessible controls; search; complete/undo; cancel/restore.
5. Sign out; protected data and export are unreachable.

Forced: invalid input, stale update, atomic create/schedule failure, network/offline write, and User B
guessing User A identifiers.

### G2 — Plan across time

1. Create all-day and timed tasks in the configured timezone, including editable natural-language
   recognition.
2. See the same records in Today, Upcoming, month, week/day, agenda, and Matrix.
3. Drag/resize one event and edit another with the keyboard/touch form.
4. Open canonical task details from planning surfaces and update priority/schedule.
5. Cross local midnight/change timezone and confirm affected projections refresh.

Forced: DST gap/fold, schedule conflict, range boundary, overlap, empty calendar, and unauthorized
schedule/detail access.

### G3 — Reality-aware plan

1. Paste a brain dump, select owned unscheduled tasks, and set planning constraints.
2. Generate a strict proposal with estimates, rationale, uncertainty, and overflow.
3. Edit/deselect actions and inspect before/after values.
4. Refresh/reopen Review and recover the persisted proposal.
5. Apply explicitly and confirm one atomic idempotent update across projections.

Forced: no key, refusal, timeout, malformed/irrelevant output, unknown/cross-user record, stale
proposal, duplicate apply, and concurrent task change. Every pre-apply failure writes zero domain data.

### G4 — Core portability and release trust

1. Reset isolated demo twice without shared state.
2. Export and validate the current versioned document.
3. Lose connectivity in an open page; rendered data stays visible/read-only and writes are disabled.
4. Sign out; private routes/export are inaccessible.
5. Repeat local health, migration, demo, and critical paths in a clean browser.

Forced: export failure, second-user fixture, database unavailable, missing providers, and duplicate
demo reset.

### G5 — Recurring task lifecycle

1. Create all-day and timed series from approved presets with an end condition.
2. See bounded occurrences in Today/Upcoming/Calendar/agenda/Matrix.
3. Complete one occurrence, skip another, undo each, and confirm the series stays open.
4. Edit/end future expansion and confirm past occurrence events remain stable.
5. Export the series and occurrence state.

Forced: invalid preset/range, cap boundary, DST, month-end, leap-day, cutover boundary,
duplicate/concurrent occurrence write, monotonic event `task_version`, stale series version, and
cross-user series/event access. Force recurrence-detail, bounded-source, and Today/Matrix composite
reads across a concurrent recurrence/occurrence cutover and prove each result comes from one
actor-scoped snapshot rather than a torn aggregate.

### G6 — Habit lifecycle

1. Create boolean and numeric habits across all three schedule types.
2. Check in, edit quantity/note, undo, skip, and mark unachieved from Today/detail.
3. Inspect seven-day, streak, and monthly history projections.
4. Archive/restore without losing history and export the data.

Forced: invalid discriminant/quantity, same-day concurrent write, ISO-week/DST boundary,
below-target open versus closed week, post-target edit/undo, offline/conflict, empty history, and
cross-user habit/log access.

### G7 — Authoritative Focus session

1. Start a Pomodoro linked to an owned task/habit; pause, refresh/reconnect, resume, and finish.
2. Run stopwatch and a break; confirm break time is excluded.
3. Inspect totals/history, correct one completed session, and delete another.
4. Export completed history.

Forced: simultaneous start race, hostile client clock, repeated transition, inaccessible link,
offline/reconnect, history-only error, and cross-user session access.

### G8 — Install and remind

1. Validate/install the PWA with original manifest/icons and open standalone.
2. Lose connectivity: an already open screen becomes read-only and a cold navigation reaches the
   content-free offline fallback.
3. From an explicit action, enroll push and set one absolute/relative reminder.
4. Run the worker and observe one privacy-safe logical delivery; click through to the owned task.
5. Reschedule/complete/delete/disable and confirm stale deliveries no-op; revoke subscription.

Forced: cache update/removal, no authenticated content in Cache Storage, unsupported/denied
  permission, no VAPID, known-disabled worker, configured-but-unverified worker liveness, duplicate
  job, invalid absolute recurring reminder, enable/disable, recurrence conversion/removal, explicit
  transient retry, timeout/statusless unknown without resend, permanent subscription failure,
  generic same-browser reset without cross-user revocation, recurring next occurrence/DST,
  crash-lease repair, retention,
  and cross-user reminder/subscription access.

### G9 — Full local release

1. From a fresh clone, install, start PostgreSQL, migrate, run web and active worker, and enter demo.
2. Complete representative G1–G8 beats with OpenAI/push configured and provider-degraded variants.
3. Export the full versioned data set and validate relationships/secrets exclusion.
4. Exercise production build/Compose health and clean SIGTERM shutdown.
5. Re-run in a clean signed-out browser and prepare only verified screenshots/video claims.

## Package acceptance evidence

| Package | Required evidence |
|---|---|
| P1 | G1–G4 + atomicity/freshness/origin/provider-degraded tests |
| P2 | G5 + recurrence migration/time/range/ownership suites |
| P3 | G6 + habit migration/log/streak/time/ownership suites |
| P4 | G7 + Focus migration/state/race/clock/ownership suites |
| P5 | install/cache/fallback/privacy/offline-write audit |
| P6 | G8 push half + reminder migration/encryption/idempotency/provider/worker suites |
| P7 | G9 + expanded export/demo/fresh-clone/full audits |

## Candidate gates

### Visual-change gate

Editorial Focus is the approved baseline. A package that changes shared visual foundations or the
direction of a primary screen must provide deterministic 1440 and 390 evidence, representative dark
and 768/320 boundary evidence, and explicit user approval before integration. A requested revision
is work, not approval.

### Stable submission-candidate gate

A new package may replace the existing fallback only when:

- its migrations/build and all affected golden paths are green;
- desktop 1440 and mobile 390 primary screenshots are approved where visuals changed;
- no blocker/critical defect, authorization/privacy regression, mixed design, dead later control, or
  failed package gate remains;
- the exact candidate commit, local run path, seven-minute test, and known limitations agree.

Hosted deployment is optional for this goal. If used for the hackathon, it receives the same clean-
browser health/demo/privacy checks and is evidence, not a substitute for local reproducibility.

## Mandatory release audits

### 1. Scope and truth

- Diff every route/table/dependency/job/claim against `docs/SCOPE.md` and package order.
- Confirm Stage A–D surfaces and dead controls are absent.
- Confirm local-first is not described as offline-first and every optional provider has manual
  fallback/degraded state.

Failure: unapproved behavior, missing acceptance mapping, dormant later code, or misleading claim.

### 2. Architecture and modularity

- Run boundary lint; inspect cross-module imports/public exports and files over size guidance.
- Confirm route/React code has no Drizzle/business rules; domain has no framework/provider; worker
  calls notification application services rather than repositories from another module.

Failure: bypassed layer, ambiguous ownership, duplicate rule, shared feature widget, or catch-all.

### 3. Schema and migrations

- Run `pnpm check:schema`; compare every table/column/index/constraint with `docs/DATA_MODEL.md`; run empty and sequential
  upgrade migrations.
- Confirm no cloned occurrence tasks, stored streak/Focus totals, duplicate date/status, generic
  metadata/EAV, or unapproved JSONB.
- Review recurrence range, habit local-day, Focus active-session, reminder/delivery, and export query
  plans/ownership.
- For notifications, inspect exact state-shape checks, global active endpoint uniqueness,
  tenant-leading foreign keys, encryption-envelope/hash bounds, actor-targeted maintenance, and the
  additive `0015` fresh/upgrade path.

Failure: synonymous fact, missing constraint/index/tenant key, unreviewed migration, or projection
persisted as truth.

### 4. Authentication and authorization

- Test unauthenticated and cross-user access to identity, all task/occurrence, habit/log, Focus,
  reminder/subscription, proposal, demo, and export surfaces.
- Review cookies, exact origin/CSRF, rate limits, sign-out/demo-reset cache clearing, push enrollment,
  and existence-safe errors.

Failure: horizontal/vertical access, shared demo/cache leak, cookie-only authorization, or endpoint
existence disclosure.

### 5. Security, privacy, and logging

- Strict Zod/DB bounds; Markdown/XSS; CSP/headers; safe redirects; parameterized SQL; client-bundle
  secret scan.
- Logs/job/export/cache contain no user content, emails, sessions, OpenAI/VAPID keys, push endpoints,
  subscription auth/ciphertext/hash, raw Web Push errors/headers/bodies, or provider payloads.
- Run secret, production dependency, font/asset, and license inventory gates.

Failure: exploitable input/output, content/secret exposure, unsafe private cache, or applicable
unresolved high/critical advisory/license conflict.

### 6. Time, recurrence, habits, and Focus correctness

- Run UTC, America/New_York, and Asia/Singapore fixtures across DST, midnight, month/year end,
  leap-day, week start, all-day/timed conversion, occurrence cap, habit weekly target, Focus pause/
  reconnect, and exactly-24-hour Matrix boundaries.

Failure: machine-timezone dependency, shifted date, duplicate occurrence/log/session duration,
unbounded expansion, or stored derived counter.

### 7. AI safety and correctness

- Reprove Structured Output/refusal, minimal context/`store:false`, allowed actions, diff/uncertainty/
  overflow, ownership/version/idempotency/atomic apply, and zero pre-apply writes.
- Recurring occurrences may be bounded context but AI cannot create/edit recurrence, habits, Focus, or
  reminders in this release.

Failure: autonomous/hidden write, illegal schedule/action, stale overwrite, or content oversharing.

### 8. PWA, reminder, and worker reliability

- Inspect manifest/service-worker scope, cache inventory/update/cleanup/offline fallback, push event/
  click handling, permission gesture, encryption, transactional enqueue, idempotency, retry/revoke,
  outcome-unknown no-resend, stale no-op, recurring next occurrence, reversible attempt-zero
  suppressed-row reactivation,
  two-minute crash lease, 30-day cleanup eligibility, exact two-queue options, greater-than-31-day
  worker-outage actor recovery without a global scan, check-mode non-consumption, and worker signal
  handling.

Failure: private cached data, accepted offline write, stale build trap, double delivery, secret/content
job, reminder corruption, or provider/worker required for core boot.

### 9. Accessibility and responsive visuals

- Axe has no serious/critical issue on every active screen/state.
- Keyboard-only paths cover navigation, add/edit, dialogs, reorder, calendar alternative, proposal,
  occurrence, habit, Focus, install/update, reminder enrollment/revoke, and permission recovery.
- Inspect default/empty/loading/error/offline/permission/provider/conflict at 1440, 1024, 768, 390,
  and 320, plus light/dark/system, coarse pointer, 200% zoom, reduced motion, focus return, and target
  sizes.

Failure: blocked action, drag/gesture/color-only path, hidden focus, overflow, unreadable timer/chart,
serious/critical axe issue, or design-contract mismatch.

### 10. Reliability, reproducibility, and release evidence

- Rehearse DB/OpenAI/VAPID/worker/network unavailable, slow/duplicate/stale mutations, cache upgrade,
  explicit retries, ambiguous provider outcomes, and clean shutdown. Validate export envelope v5 /
  notifications v1 while proving all subscription/delivery/job/provider configuration is absent.
- Follow README from a fresh clone through PostgreSQL, migrations, seed readiness, web, active worker,
  demo, golden paths, export, production build/Compose, and provider-degraded use.
- Verify video/screenshots/README describe the same release commit and expose no secrets/personal data.

Failure: corruption, duplicate effective write/delivery, hidden setup step, unhealthy process,
unreproducible local demo, or unverified public claim.

## Defect policy

| Severity | Definition | Release rule |
|---|---|---|
| Blocker | data/security/privacy loss, cross-user access, cannot start/build/migrate, or candidate/demo impossible | must fix |
| Critical | active acceptance failure, autonomous/incorrect AI write, duplicate/corrupt reminder/timer/occurrence, or inaccessible primary action | must fix |
| Major | important recovery/responsive/provider-degraded path broken with documented workaround | fix before package integration unless contract declares limitation |
| Minor | cosmetic issue that does not impair action, readability, or trust | may document after required gates pass |

Do not downgrade because time is short. A cut requires the five-part user-authorized scope change.

## Final sign-off

The auditor reports release commit/environment, exact commands/results, P1-P7 evidence,
G1–G9 at required widths, visual approvals, migration/worker/PWA/provider smokes, all ten audit
results, dependency/font/asset licenses, and contract-permitted limitations.

Sign-off is denied for any blocker/critical defect, failed required command, unmapped acceptance,
unchecked audit, missing required visual approval, or falsely claimed external live smoke.
