# Tasks module contract

`modules/tasks` owns personal task organization, canonical task state, and one optional non-recurring schedule per task. Planning surfaces consume task projections.

## Responsibilities

- Folder, regular-list, section, tag, task, one-level subtask, and checklist CRUD.
- Immutable personal Inbox behavior, task move/manual reorder, soft delete/restore, and status transitions.
- All-day/timed schedules with explicit timezone semantics.
- English quick-add recognition with `chrono-node`, preserving visible editable source text.
- User-scoped task/title/description/tag search and bounded authorized task reads for other modules.

## Owned persistence

- `list_folders`, `task_lists`, `list_sections`.
- `tasks`, `task_schedules`.
- `checklist_items`, `tags`, `task_tags`.

## Public use cases and contracts

- Container commands: create/update/reorder/soft-delete/restore folders and lists; create/update/reorder/delete empty sections; `createPersonalInbox` for identity bootstrap.
- Task commands: create/update/move/reorder/soft-delete/restore and transition among `open`, `completed`, and `cancelled`.
- Detail commands: manage tags and checklist items; set/clear schedule.
- Queries: get task detail, list/search tasks, load selected open unscheduled tasks, and range-bounded schedule reads.
- Parsing: `parseQuickAdd(text, timezone)` returns the unchanged source text plus explicit editable suggestions; it performs no write.
- Public contracts: the WP02 folder/list/section/tag/task DTO and tag-enriched task-list item/page types,
  `ReplaceTaskTagsOutput`, `TaskQuery`, `TerminalTaskQuery`, `TaskVersionRef`, `TaskScheduleDto`,
  `TaskSnapshotReader`, and narrow mutation services used by assistant/planning/portability.
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
- All-day schedules use inclusive `start_date` and exclusive `end_date`; a one-day task ends on the following local date. Timed schedules use UTC `start_at`/`end_at` plus the intent timezone. Representations never mix.
- A schedule mutation increments the owning task `version` exactly once in the same transaction.
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

- Smart-view, calendar, agenda, Eisenhower, or deterministic planner projection logic.
- Recurrence/occurrence handling, reminder definitions, push subscriptions/delivery, focus totals, habit state, AI fields, saved filters, collaboration, or import.
- Batch editing, Kanban, or timeline.

## Required tests

- Domain tests for status transitions, Inbox immutability, one-level subtasks, checklist behavior, ranks, and container deletion/move rules.
- Database constraint and cross-user denial tests for every aggregate and relationship.
- All-day inclusive/exclusive, timed schedule, and spring-forward/fall-back tests.
- Optimistic-version tests proving one increment per accepted aggregate mutation and typed conflicts for stale writes.
- Search ownership/soft-delete tests and seeded query-plan checks.
- Quick-add fixtures proving original text remains intact and suggestions are editable.
