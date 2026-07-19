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
- Task commands: create/update/move/reorder/soft-delete/restore and transition among `open`, `completed`, and `cancelled`.
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
- Schedule and occurrence range queries require both representations, cap the local-date span at 62
  days and the elapsed instant span at 63 days, and return at most 500 projected rows plus a
  truncation signal. They never return an occurrence outside the requested bounds, and the domain
  wrapper applies an explicit computation cap while resolving count/end semantics.
- A schedule mutation increments the owning task `version` exactly once in the same transaction.
- A recurring series is an open, non-deleted, scheduled root task with one `generation_mode=schedule`
  rule. Subtasks cannot own recurrence; checklist/subtask state is not repeated per occurrence.
- API/UI recurrence input is a typed preset, never raw RRULE text: daily, weekdays, weekly on selected
  ISO weekdays, monthly on the schedule's day of month, or yearly on its month/day, with a bounded
  positive interval and never/until/count ending. The domain wrapper alone normalizes and parses the
  stored RRULE; that serialization contains no second start value because `task_schedules` remains
  the only series anchor.
- The recurrence row has exactly one checked projection cutover: local date for all-day or instant for
  timed. Initial projection begins at the schedule anchor. An edit replaces the single mutable rule
  and uses a server-chosen future cutover; the current rule never projects before it. Recorded prior
  events remain, while unrecorded pre-cutover occurrences are intentionally not reconstructed.
- An occurrence is a projection of the task schedule and rule, identified by an opaque stable
  `occurrence_key` derived from the series and canonical all-day local date or timed start instant.
  It is not a task row and owns no copied schedule, status, checklist, or subtask state.
- Occurrence transitions append immutable `completed`, `skipped`, or `open` events. The effective
  state is the event with the greatest immutable post-command `task_version`; timestamps and UUIDs do
  not order causality. Commands serialize on the owning task,
  reject stale versions, append nothing for a no-op/replay, and increment the task version once for
  an accepted change.
- Completing or skipping an occurrence never changes the series task status. Normal terminal-state
  commands do not stand in for occurrence actions; an explicit rule edit/end controls future
  expansion. Rule and schedule edits select a future cutover, preserve recorded occurrence events and
  their keys, do not reconstruct unrecorded earlier projections, and cannot create a second identity
  for the same canonical occurrence.
- Timed expansion preserves the series IANA timezone and intended local wall time through DST;
  the rule timezone must equal the timed schedule timezone. All-day expansion remains local-date
  based while retaining its validated IANA rule zone. Month/year presets follow the domain wrapper's
  tested calendar-boundary policy rather than silently converting to elapsed durations.
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
- Optimistic-version tests proving one increment per accepted aggregate mutation and typed conflicts for stale writes.
- Search ownership/soft-delete tests and seeded query-plan checks.
- Quick-add fixtures proving original text remains intact and suggestions are editable.
