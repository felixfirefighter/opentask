# Tasks module contract

`modules/tasks` owns personal task organization, canonical task state, one optional schedule per task,
and bounded schedule-based recurrence/occurrence state. Planning surfaces consume task and occurrence
projections through its public application contracts.

## Responsibilities

- Folder, regular-list, section, tag, task, one-level subtask, and checklist CRUD.
- Immutable personal Inbox behavior, task move/manual reorder, soft delete/restore, and status transitions.
- Inbox, regular-list, and Completed/Cancelled task projections over canonical task rows.
- All-day/timed schedules with explicit timezone semantics.
- One schedule-anchored recurrence rule for an eligible root task, limited to the active presets and
  ending modes.
- Range-bounded recurrence expansion plus complete, skip, and undo state for one occurrence without
  cloning tasks or completing the series.
- English quick-add recognition with `chrono-node`, preserving visible editable source text.
- User-scoped task/title/description/tag search and bounded authorized task reads for other modules.
- Task-backed global palette composition for destination navigation, authorized search, and quick add.

## Owned persistence

- `list_folders`, `task_lists`, `list_sections`.
- `tasks`, `task_schedules`, `task_recurrences`, `task_occurrence_events`.
- `checklist_items`, `tags`, `task_tags`.

## Public use cases and contracts

- Container commands: create/update/reorder/soft-delete/restore folders and lists; create/update/reorder/delete empty sections; `createPersonalInbox` for identity bootstrap.
- Task commands: create/update/move/reorder/soft-delete/restore and transition among `open`,
  `completed`, and `cancelled`; `createTaskWithSchedule` atomically creates one task and its validated
  initial schedule under the same actor-scoped UUID idempotency contract.
- Detail commands: manage tags and checklist items; set/clear schedule; set/edit/end a supported
  recurrence rule.
- Occurrence commands: complete, skip, and undo/reopen one authorized occurrence using its opaque
  deterministic identity and the owning task's expected version.
- Queries: get task detail, list Inbox/regular/terminal tasks, search tasks, load selected open
  unscheduled tasks, and range-bounded schedule/occurrence reads.
- Parsing: `parseQuickAdd(text, timezone)` returns the unchanged source text plus explicit editable suggestions; it performs no write.
- Public contracts: the existing folder/list/section/tag/task DTO and tag-enriched task-list item/page types,
  `ReplaceTaskTagsOutput`, `TaskQuery`, `TerminalTaskQuery`, `TaskVersionRef`, `TaskScheduleDto`,
  `TaskSnapshotReader`, `TaskRecurrenceDto`, `TaskOccurrenceDto`, bounded occurrence query/result
  contracts, and narrow mutation/snapshot services used by assistant/planning/notifications/
  portability.
- The module root explicitly exports only those cross-module DTOs plus the strict request/query schemas
  consumed by `app/api/v1`; base resource, cursor, rank, and field schemas remain module-internal.

No public contract exposes a Drizzle row or an unscoped repository method.

## Invariants

- Every SQL read/write is constrained by `user_id`; parent, list, section, tag, and task ownership must agree.
- Client-generated folder, list, section, task, checklist, and tag UUIDs are actor-scoped database
  identities `(user_id, id)`. Two users may independently use the same UUID without a collision or
  existence signal.
- Exactly one active `kind=inbox` list exists per user. It cannot be renamed to regular, moved to Trash, or deleted.
- Inbox creation is bootstrap-only. Ordinary list update, move, reorder, and delete commands reject it.
- A regular list with active tasks is deleted only by an explicit transaction that moves those tasks.
- The active release exposes at most one subtask level; subtasks remain full tasks in the same user and list.
- `status` is the sole current task-state field; `status_changed_at` records its transition time.
- All-day schedules use inclusive `start_date` and exclusive `end_date`; a one-day task ends on the following local date and its derived midnight boundary uses the user's saved IANA timezone. Timed schedules use UTC `start_at`/`end_at` plus the intent timezone. Representations never mix.
- Schedule and occurrence range queries require both date and instant bounds, cap the local-date
  span at 62 days and the elapsed instant span at 63 days, and return at most 500 combined one-off
  and recurring rows in canonical start/task/key order plus a truncation signal. One request
  evaluates at most 500 recurrence rows, 1,000 emitted candidates per series, 50,000 candidates
  overall, and 50,000 latest recorded occurrence-event states. The bounded event read is necessary to
  recover recorded keys from prior mutable rules without storing a second occurrence schedule.
  Hitting a source, event, computation, or output cap is explicit; planner busy-time reads reject
  truncated context rather than planning against an incomplete calendar.
- Atomic task-plus-schedule creation inserts both rows in one transaction and returns task version
  `1`; the initial schedule is part of aggregate creation and does not increment that new version.
  Every later set/replace/clear schedule mutation increments the owning task `version` exactly once
  in the same transaction.
- An active recurring series is an open, non-deleted, scheduled root task with one non-exhausted,
  not-ended `generation_mode=schedule` rule. Subtasks cannot own recurrence; checklist/subtask state
  is not repeated per occurrence. Cancelled or soft-deleted owners may retain a dormant active rule
  but never project occurrences. A completed owner may retain only an explicitly ended rule.
- API/UI recurrence input is a typed preset, never raw RRULE text. `interval` is an integer from 1 to
  99. `count` is an integer from 1 to 999. `untilDate` is an inclusive local date in the stored rule
  timezone and applies to occurrence starts. Weekly weekday input is a sorted unique non-empty set
  of ISO values 1=Monday through 7=Sunday; recurrence weeks always start Monday independently of the
  user's display preference.
- Daily means every N local calendar days. Weekdays means Monday-Friday every N ISO weeks. Selected-
  weekday weekly means those weekdays every N ISO weeks. Monthly uses the schedule anchor's day of
  month and skips months without it. Yearly uses the anchor's month/day and skips non-leap years for
  February 29. The schedule anchor must satisfy the chosen weekday preset, so it is occurrence one;
  invalid calendar candidates are omitted and do not consume `count`.
- A recurring schedule is whole-minute aligned. All-day duration is 1-31 calendar days; timed
  duration is 0-31 exact elapsed days. These are recurrence-eligibility bounds, not new limits on
  one-off schedules. A timed occurrence preserves the anchor's local wall-clock start in its IANA
  zone, resolves a spring gap to the later valid instant and a fold to the earlier instant, and ends
  after the canonical schedule's exact elapsed duration. All-day occurrences preserve their
  calendar-day duration. An ambiguous anchor that selected the later fold instant is not eligible.
  While a recurrence definition exists, its schedule kind is fixed: all-day remains all-day and
  timed remains timed. Changing kind requires ending recurrence and clearing its ended definition
  with the schedule first; non-recurring root tasks retain ordinary schedule-kind editing.
- The task-owned RRULE adapter accepts only the typed domain preset, never presentation or arbitrary
  text. It stores a canonical uppercase ASCII property list of 1-512 characters with no prefix,
  `DTSTART`, line break, `RDATE`, or exclusion rule. `task_schedules` remains the only series anchor;
  `rrule` is isolated behind the recurrence expansion port and does not own timezone conversion,
  duration, identity, caps, or public serialization.
- The recurrence row has one checked lower projection cutover and an optional matching upper cutover:
  local dates for all-day or instants for timed. Initial projection begins at the matching schedule
  anchor with no upper cutover. A rule-only edit retains that anchor and chooses the first new-rule
  occurrence strictly after authoritative server now interpreted in the stored recurrence timezone
  (strictly after that local day for all-day, or after that instant for timed). Every explicit rule
  edit is a restart: it clears an old upper cutover and chooses that future lower boundary. A
  recurring schedule edit does the same while atomically supplying the new schedule and regenerating
  the normalized rule. If its count/until is exhausted before that cutover, create/edit is rejected
  rather than silently ending the series.
- Ending a series is an explicit versioned command that retains the definition but sets an exclusive
  upper cutover to the first rule candidate strictly after authoritative server now (or, when no
  candidate remains, the next local date for all-day and now for timed). Occurrences starting before
  that boundary remain reconstructable; none at or after it project. Recorded occurrence events and
  keys remain. An ended rule is visible as ended, can be edited to restart future expansion, and does
  not make its anchor schedule behave as a one-off task.
- Completing the owning task is rejected while its recurrence is active; users complete individual
  occurrences. Once explicitly ended, the task may be completed. Cancel and soft delete retain an
  active rule as dormant state. Resuming a cancelled task or restoring a deleted task advances its
  active rule's lower cutover to the first strictly future eligible occurrence, so missed dormant
  occurrences are not reconstructed. Reopening a completed task with an ended rule changes only task
  status; it does not restart recurrence. An ended rule restarts only through explicit recurrence
  edit. If an active saved end condition has no future candidate, the owner still resumes/restores but
  the rule remains visibly exhausted until the user edits or ends it. Clearing a schedule is rejected
  while recurrence is active; for an ended rule, clear schedule atomically removes that definition
  and schedule while preserving events.
  Every accepted rule, recurring-schedule, end, resume, or ended-rule schedule-clear mutation
  increments the task version exactly once.
- Ordinary calendar drag/resize is disabled for recurring events because an individual occurrence
  override is outside scope; the canonical form edits the future series schedule instead.
- An occurrence is a projection of the task schedule and rule, identified by a client-opaque stable
  key of at most 80 characters: `o1.` plus base64url of the lowercase task UUID and either
  `|d|YYYY-MM-DD` or `|t|epochMilliseconds`. The server decodes and verifies task/kind/start before a
  first transition; clients never parse it. It is not a task row and owns no copied schedule,
  status, checklist, or subtask state. The same canonical start retains the same key across views
  and rule edits.
- Occurrence transitions append immutable `completed`, `skipped`, or `open` events. The effective
  state is the event with the greatest immutable post-command `task_version`; timestamps and UUIDs do
  not order causality. Complete/skip first validates a candidate under the current rule and cutover;
  undo may reopen a recorded key that a later rule no longer emits. Commands serialize on the owning
  task, reject stale different-state writes, append nothing for a same-state no-op, and increment the
  task version once for an accepted change. A response-lost retry is recognized only when the latest
  event for that key/state has `task_version = expectedVersion + 1`; otherwise a stale version remains
  a conflict.
- Aggregate commands use one lock order: owning task row, recurrence row when present, schedule row
  when present, then occurrence-event reads/appends. Schedule edits, occurrence transitions,
  cancel/reopen, and delete/restore never acquire those resources in another order.
- Completing or skipping an occurrence never changes the series task status. Normal terminal-state
  commands do not stand in for occurrence actions; an explicit rule edit/end controls future
  expansion. Rule and schedule edits select a future cutover, preserve recorded occurrence events and
  their keys, do not reconstruct unrecorded earlier projections, and cannot create a second identity
  for the same canonical occurrence.
- The rule timezone must equal the timed schedule timezone. All-day recurrence stores the user's
  validated IANA timezone at create/edit; a later preference change does not shift its local dates.
- Soft-deleted tasks are absent from normal projections and search. Purge is not exposed.
- Create commands use the client-generated UUIDv4 resource ID as their idempotency key. While a
  resource row is retained, an equivalent retry returns it and a mismatched reuse conflicts;
  soft-deleted rows are never resurrected by create. Sections and checklist items are intentionally
  hard-deleted, so a create received after their successful deletion is a new resource even if its
  client UUID is reused. No generic idempotency table or response document exists.
- Status commands accept only `open -> completed`, `completed -> open`, `open -> cancelled`, and
  `cancelled -> open`. Same-state and direct terminal-to-terminal requests conflict without a write.
- Rank scopes are user for folders, user/folder for regular lists, user/list for sections,
  user/list/section for root tasks, user/list/parent for subtasks, and user/task for checklist items.
  Persisted rank columns use PostgreSQL `"C"` collation. Rank mutations serialize per scope, order
  bytewise by `(rank, id)` in both PostgreSQL and the application rank service, and use the one
  application rank service. Keys above 64 characters trigger at most a 500-row rebalance; stored
  keys are capped at 128 characters.
- Soft-deleting a folder preserves list links; while the folder is deleted those lists are exposed
  as effectively unfiled, so restoring the folder reattaches them. Deleting a regular list requires
  an active destination and moves active task trees there, clearing incompatible sections; restoring
  the list does not move tasks back.
- A section is empty when it has no active tasks. Deletion clears its reference from already-deleted
  tasks in the same transaction, then hard-deletes the section.
- Moving a root task moves its direct subtasks in the same transaction. Soft-deleting a root uses one
  deletion instant for it and its active subtasks; restore revives only subtasks marked by that same
  deletion event. Restore otherwise requires active owned container relationships.
- The same-user/same-list parent relation is a composite PostgreSQL foreign key declared
  `DEFERRABLE INITIALLY DEFERRED`; Drizzle's PostgreSQL foreign-key DSL does not currently encode
  deferrability, so the reviewed SQL migration owns that clause and migration tests protect it.
- Tags soft-delete and restore while task-tag joins remain intact. Checklist mutations use checklist
  row versions only; attaching or detaching an unversioned task-tag join increments the task version
  exactly once.
- Quick add never silently removes or rewrites user text.

## Dependencies

- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- `chrono-node` for visible editable schedule suggestions.
- A narrow infrastructure adapter over pinned `rrule`; domain policy remains provider-free.

## Non-responsibilities

- Today/Upcoming, calendar, agenda, Eisenhower, or deterministic planner projection logic.
- Reminder definitions, push subscriptions/delivery, focus totals, habit state, AI fields, saved
  filters, collaboration, or import.
- Completion-relative recurrence, arbitrary RRULE entry, per-occurrence schedule/content overrides,
  recurrence forks, exclusion-date editing, and recurring checklist/subtask instances.
- Batch editing, Kanban, or timeline.

## Required tests

- Domain tests for status transitions, Inbox immutability, one-level subtasks, checklist behavior, ranks, and container deletion/move rules.
- Database constraint and cross-user denial tests for every aggregate and relationship.
- All-day inclusive/exclusive, timed schedule, and spring-forward/fall-back tests.
- Preset/end validation, bounded expansion/cap, deterministic occurrence identity, DST gap/fold,
  month-end, leap-day, edit/end, complete/skip/undo, no-op replay, and no-duplicate tests.
- Database constraint, optimistic-concurrency, and cross-user denial tests for recurrence rules and
  occurrence events.
- Deterministic isolated-demo fixtures include one canonical recurring task plus completed/skipped
  occurrence history; repeated reset proves event cleanup uses the owning-task cascade rather than
  a direct immutable-event delete.
- Optimistic-version tests proving one increment per accepted aggregate mutation and typed conflicts for stale writes.
- Search ownership/soft-delete tests and seeded query-plan checks.
- Quick-add fixtures proving original text remains intact and suggestions are editable.
