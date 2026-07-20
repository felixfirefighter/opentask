# Local-first Full Release forward plan

This is the canonical dependency and delivery plan for the unfinished P2-P7 work in
`docs/SCOPE.md`. The implemented and approved baseline is summarized in `README.md`; completed
sequencing exists only in Git. Verification lives in `docs/QUALITY.md`.

## Execution baseline

- `main` stays a green, locally runnable baseline while a later package is incomplete.
- Editorial Focus is frozen across current routes. Later UI extends it through `DESIGN.md`; broad
  restyling or shared-foundation changes require explicit user approval and new visual evidence.
- P2 is the next active package in numbered execution order. P3 and P5 are dependency-unblocked but
  remain unstarted; no package may expose a table, route, dependency, worker job, service worker, or
  control before its own gate.
- A package integrates only as a coherent unit after its acceptance and audit gates pass. A partial
  implementation, screenshot, elapsed time, or available agent is not a merge criterion.
- The remaining work is estimated at **114-172 serial engineering hours** before external-provider
  and user-approval latency. Estimates guide coordination; they never weaken a gate or authorize a
  scope cut.
- Hackathon timing and submission operations live in `docs/HACKATHON.md`, not in this product plan.

## Remaining dependency graph

```mermaid
flowchart LR
    BASELINE["Implemented stabilized local core"] --> P2["P2: recurrence"]
    BASELINE --> P3["P3: habits"]
    BASELINE --> P5["P5: installable PWA shell"]
    P3 --> P4["P4: Focus"]
    P2 --> P6["P6: browser reminder"]
    P5 --> P6
    P2 --> P7["P7: portability/demo/release audit"]
    P3 --> P7
    P4 --> P7
    P5 --> P7
    P6 --> P7
```

P2, P3, and P5 may run in parallel from the stabilized-core gate. P4 may begin pure
domain work after the Habits ownership-validator contract freezes. P6 waits for recurrence and the
service-worker contract. Each P2-P6 package supplies and integrates its portable representation;
the integration owner serializes export-schema version bumps as packages land. P7 owns the final
cross-version audit, demo, documentation, and cross-module evidence, not the first export integration.

## Parallel execution contract

Parallel work is split by capability and layer ownership, never merely by route.

### Integration-owner files

Only the integration owner edits or serializes:

- canonical scope, goal, plan, architecture, data, stack, design, and quality contracts;
- `package.json`, `pnpm-lock.yaml`, shared environment configuration, and license allowlists;
- shared design tokens, root shell/navigation, and root route maps;
- global Drizzle schema aggregation and generated `drizzle/*` migrations;
- worker composition, export schema version, demo reset composition, Docker/CI/release configuration;
- full database, browser, service-worker, worker, Docker, and `pnpm verify` gates.

### Worker rules

- Each lane starts from the same green checkpoint in an isolated worktree/task and owns an explicit
  non-overlapping file list.
- Pure domain/application/test work may run before a serialized migration only when the public
  contract is frozen and no dormant production export is exposed.
- A lane returns a coherent commit plus exact focused checks. The integration owner audits scope,
  boundaries, schema, ownership, security, and dead code before integration.
- No worker silently edits shared tokens, dependency files, global schemas, migrations, route maps,
  or canonical contracts.
- Browser, Docker, database, and full gates run centrally and sequentially to avoid shared-state and
  machine-resource conflicts. Static lanes may run concurrently because repository checks must not
  create lint-visible temporary source files.

## P2 — Bounded schedule-based recurrence (24–36 serial hours; 14–20 elapsed)

### Boundary

`modules/tasks` owns rules/events and task mutations; `modules/planning` consumes bounded public
occurrence projections. No generated task clones, second status/schedule fact, reminder behavior, or
AI-created recurrence.

### Deliverables

- Promote reviewed `rrule` dependency through an application-owned expansion port and tasks
  infrastructure adapter, with provider-free domain policy, canonical presets, and safety caps.
- Add `task_recurrences` and `task_occurrence_events` through one reviewed migration with tenant-
  leading ownership, checked date/instant cutovers, immutable post-command `task_version` ordering,
  constraints, indexes, upgrade tests, and no generic JSON.
- One schedule-anchored rule for an eligible scheduled root task: daily, weekdays, weekly selected
  weekdays, monthly day-of-month, or yearly month/day, bounded interval, and never/until/count end.
- Store a checked all-day/date or timed/instant projection cutover on the single mutable rule. Initial
  projection begins at the schedule anchor; rule/schedule edits choose a server-controlled future
  cutover, preserve recorded earlier events, and do not claim to reconstruct unrecorded pre-cutover
  occurrences.
- Deterministic `occurrence_key`, range-bounded all-day/timed expansion, DST/month/year behavior, and
  projection into Today, Upcoming, Calendar, agenda, and Matrix.
- Complete, skip, and undo/reopen one occurrence without completing the series; edit/end future
  expansion while preserving past occurrence events.
- Task-detail/row occurrence labels and accessible series/occurrence actions; planner treats bounded
  recurring busy intervals as context but cannot create/edit recurrence.
- Recurrence demo fixture plus an integrated, version-bumped portable recurrence/event section before
  the P2 gate; the integration owner serializes the shared export schema.
- The exact preset, interval/count/duration/query/computation limits plus missing-month/leap-day,
  DST, cutover, lifecycle, projection, and retry policies are frozen in `docs/modules/tasks.md`,
  `docs/modules/planning.md`, and `docs/DATA_MODEL.md`. Migration, Zod, domain, and UI code reuse
  those values and may not invent a local bound.

### Explicit exclusions

Completion-relative rules, raw RRULE entry, individual occurrence reschedule/content edit, “this and
future” forks, exclusion-date editor, recurring checklist/subtask state, and arbitrary custom
cadence remain Stage A.

### Gate

- Preset/Zod/domain/DB constraint, ownership, optimistic conflict, and concurrency tests.
- Deterministic cap/range/occurrence-key, DST gap/fold, month-end, leap-day, edit/end, complete/skip/
  undo, and no-duplicate fixtures.
- Desktop/mobile recurrence golden path, keyboard schedule parity, responsive/a11y/design evidence.
- Empty and upgrade migration, query-plan/index review, `pnpm verify`.

## P3 — Habits (22–34 serial hours; 13–19 elapsed)

### Boundary

`modules/habits` owns definitions, schedules, local-day logs, and derived projections. No task,
Focus, reminder, social, achievement, or health behavior is hidden inside it.

### Deliverables

- Promote `habits`, `habit_schedules`, and `habit_logs` through one reviewed migration and narrow
  public application contracts.
- Create/edit/archive/restore boolean or numeric habits with daily, selected-weekday, or target-per-
  week schedules in an IANA timezone.
- Today check-in, quantity/note edit, undo, skip, and unachieved with one effective log per local day.
- Freeze ISO Monday-Sunday weekly-target behavior: show every in-range day until achieved; count each
  successful day once; keep a below-target current week in progress; fail it only after Sunday;
  preserve edit/undo after achievement without presenting more required work.
- Derived current/best streaks, seven-day strip, and compact monthly heat-map data; never store
  counters.
- Responsive Habits list/detail/create UI and Today integration with default, empty, loading, error,
  offline, permission, and conflict states.
- Integrated, version-bumped portable habit section and deterministic demo fixture before the P3
  gate; the integration owner serializes the shared export schema.
- Before migration generation, freeze exact title/icon/unit/note/value/quantity/weekly-target bounds
  in the module and data contracts so Zod, domain, PostgreSQL, and form copy share one definition.

### Gate

- Goal/schedule discriminant and DB constraints; cross-user and same-day concurrent-write denial.
- Daily/weekday/weekly-target, DST/week-boundary, quantity, edit/undo/skip/unachieved, archive/restore,
  Today, streak, and heat-map fixtures.
- Desktop/mobile Habits golden path; keyboard/screen-reader heat-map, responsive/design/a11y checks.
- Empty and upgrade migration, `pnpm verify`.

## P4 — Focus (18–26 serial hours; 11–15 elapsed)

### Boundary

`modules/focus` owns authoritative timer/session state and derived totals. It consumes narrow task and
habit ownership/link validators only. Client ticks never own persisted time.

### Deliverables

- Promote `focus_sessions` with checked `kind=focus|break` through one reviewed migration and a
  partial unique one-active-session invariant across both kinds.
- Pomodoro/stopwatch focus and explicit break start/pause/resume/finish/discard. Focus rows may link
  to one owned task or habit; break rows link to neither and never contribute to focus totals.
- Reconstruct active state from server timestamps/accumulated seconds after refresh/reconnect;
  Pomodoro breaks never contribute to stored focus time.
- Correct/delete completed sessions, today/seven-day totals, and recent history.
- Responsive Focus route with idle/running/paused/break/reconnect/loading/error/offline/permission/
  conflict states and screen-reader announcements only at meaningful transitions.
- Integrated, version-bumped portable completed-focus section (excluding break rows) and deterministic
  demo fixture before the P4 gate; the integration owner serializes the shared export schema.
- Before migration generation, freeze focus/break/correction/duration limits in the module and data
  contracts; client timer defaults cannot become database policy by accident.

### Gate

- Pure state-machine/idempotency tests with injected clock; hostile-clock/reconnect fixtures.
- DB race proving one active/paused session and cross-user task/habit/session denial.
- Pause accumulation, finish/discard, break exclusion, correction/deletion, summary-window, and
  historical-link tests.
- Desktop/mobile Focus golden path, reduced motion, tabular numeral, a11y/design checks.
- Empty and upgrade migration, `pnpm verify`.

## P5 — Installable PWA shell with honest offline fallback (10–16 serial hours)

### Boundary

Installability and static shell resilience only. Do not persist authenticated API/user content in
Cache Storage, add IndexedDB domain data, accept offline writes, register background sync, or imply
offline-first behavior.

### Deliverables

- Original maskable/standard icons, manifest metadata, standalone display, scope/start URL, theme
  metadata, and install guidance where supported.
- A small versioned service worker caching only fingerprinted public/static assets and a dedicated
  content-free offline fallback; explicit activate/update/reload and old-cache cleanup behavior.
- Preserve already rendered content read-only when connectivity drops, disable all domain writes,
  and recover cleanly online.
- Clear capability/error/update UI and service-worker registration isolated behind a presentation
  adapter; no second UI framework or speculative native layer.
- Serialize the P5 export-schema version step through the integration owner while deliberately adding
  no PWA/device/cache data section; add a regression test proving those operational details are not
  portable.

### Gate

- Manifest/icon/scope/installability audit; cold offline fallback and online recovery.
- Cache inventory proves no authenticated HTML/API, task/planner/export, provider, mutation, or
  secret-bearing response is stored.
- Upgrade/old-cache cleanup and corrupted/missing-cache recovery tests.
- Standalone desktop/mobile responsive/a11y/offline-write-denial paths and `pnpm verify`.

## P6 — One browser-push task reminder and active worker (24–36 serial hours; 14–20 elapsed)

### Boundary

`modules/notifications` owns one task reminder, subscriptions, deliveries, provider adapter, and
worker use cases. Tasks own schedules/recurrence/status; P6 consumes their frozen public events and
snapshots. Core startup stays useful without browser support, VAPID, or a running worker.

### Deliverables

- Review/install `web-push`; add `task_reminders`, `push_subscriptions`, and
  `notification_deliveries` through one reviewed migration.
- Explicit-user-action subscription/permission enrollment and revocation; encrypted endpoint/key
  material with key-version metadata and safe capability/degraded states.
- Zero/one task reminder: absolute instant only for a non-recurring task, or relative to an eligible
  task start. Recurring tasks require relative-start and enqueue only the next eligible occurrence.
- Transactional reconciliation when schedule, recurrence, status, deletion, or reminder changes;
  deterministic logical delivery idempotency.
- Active pg-boss worker delivery, bounded retry/backoff, permanent subscription revocation, stale/
  completed/deleted/rescheduled/disabled no-op, cleanup retention, and notification click-through.
- Generic privacy-safe notification copy; queue/log/export/client payloads contain no task content,
  endpoints, or key material.
- Integrate and version-bump the portable reminder-specification export before the P6 gate; exclude
  subscriptions, deliveries, queue state, and provider/encryption material.
- Report configured, unconfigured, and known-disabled worker states without inventing a heartbeat.
  When configuration expects a worker, UI says runtime liveness is not verified; operator evidence is
  the worker check plus readiness log.
- Before migration generation, freeze relative-offset semantics/range, delivery states, retry/backoff,
  stale-delivery cutoff, and retention constants in the module/data/worker contracts. Each delivery
  targets one subscription so partial multi-device provider results never share one mutable state.

### Gate

- Reminder discriminant/eligibility, ownership/version, encryption/redaction, and migration tests.
- Transactional enqueue, duplicate execution, recurrence/DST next-occurrence, stale no-op,
  transient/permanent provider, cleanup, and worker-disabled degradation fixtures.
- Service-worker push/click E2E and one configured local browser-push smoke when the user supplies
  VAPID keys and grants permission; exact external blocker reported otherwise.
- Worker/process/signal/health, responsive/a11y/design, `pnpm verify`.

## P7 — Portability, deterministic demo, and release audit (16–24 serial hours)

### Deliverables

- Audit the serial export-schema versions already integrated by P2-P6 and validate the final combined
  document containing recurrence rules/events, habits/schedules/logs, completed focus history, and
  portable reminder definitions.
- Exclude push subscriptions, endpoint keys, delivery/queue internals, credentials, provider secrets,
  raw planner input, and server configuration.
- Extend isolated deterministic demo reset across every released package without pre-granting push
  permission or requiring OpenAI/VAPID.
- Update README/setup/worker/PWA/VAPID/export/security/friend-test/submission guidance; hosted
  deployment remains optional.
- Rehearse fresh clone, empty and upgrade migrations, local production web/PostgreSQL/active worker,
  demo reset, all golden paths, export, provider-degraded paths, and clean shutdown.
- Produce approved screenshots, under-three-minute demo script, architecture/provider explanation,
  known limitations, and final acceptance evidence.

### Gate

- Version/relationship/two-user/consistent-snapshot/secret-redaction export tests.
- All core and extension golden paths at required desktop/mobile widths.
- All mandatory scope, architecture, schema, auth, security/privacy/logging, time, AI, recurrence,
  habits, Focus, PWA, push/worker, accessibility, responsive, dependency/license, secret, production,
  and dead-code audits in `docs/QUALITY.md`.
- `pnpm verify:design`, `pnpm verify`, production Compose smoke, and exact final diff review.

## Traceability

| Active capability | Package | Primary evidence |
|---|---|---|
| Existing identity/tasks/planning/AI | Stabilized baseline | G1–G4 + authorization/atomicity/freshness tests |
| Recurrence/occurrences | P2 | recurrence golden path + range/DST/ownership suites |
| Habits | P3 | Habits golden path + log/streak/time suites |
| Focus | P4 | Focus golden path + state/race/clock suites |
| Installable shell | P5 | manifest/cache/offline fallback audit |
| Browser reminder/worker | P6 | reminder/push golden path + idempotency/provider suites |
| Export/demo/local release | P7 | expanded export + fresh-clone/Compose/full audit |

## Risk and cut rules

| Trigger | Required response |
|---|---|
| A package proposes a broad visual-system change | stop dependent styling and obtain explicit approval with fresh visual evidence |
| A lane misses two 90-minute checkpoints | preserve its last green commit, stop the lane, and reassign or reassess; do not hide partial code |
| Shared contract/schema changes after consumers start | integration owner freezes consumers, updates the contract once, then rebases; consumers do not invent adapters |
| Browser/Docker resource pressure | keep coding lanes active but run heavy environment gates centrally and one at a time |
| New package is not fully green before submission work | retain the implemented baseline; do not merge a partial feature |
| External OpenAI/VAPID/browser permission is absent | keep fixture/provider-degraded paths green and report the exact manual smoke blocker |
| Time pressure suggests a feature cut | request user approval for whole packages in reverse dependency order; update all five scope-change surfaces |
| Later-scope code/control/table/dependency appears | remove it before integration regardless of time already spent |

Never cut authorization isolation, manual core behavior, review-before-apply AI, migration integrity,
export privacy, or required audits to make room for an extension. Each package is coherent or it
does not replace the implemented baseline.

## Plan completion

This plan is complete only when `docs/GOAL.md`, every active acceptance criterion, and the final P7
gate are satisfied. A timebox, overnight run, deadline, screenshot, agent count, or unavailable
external provider cannot convert skipped or failing evidence into completion.
