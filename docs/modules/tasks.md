# Tasks module contract

`modules/tasks` owns personal task organization and canonical task state. Planning surfaces consume task projections; reminders are defined and delivered by notifications.

## Responsibilities

- Folder, regular-list, section, tag, task, one-level subtask, and checklist CRUD.
- Immutable personal Inbox behavior, task move/manual reorder, soft delete/restore, and status transitions.
- All-day/timed schedules, supported recurrence series, and current-occurrence complete/skip/undo behavior.
- English quick-add recognition with `chrono-node`, preserving visible editable source text.
- User-scoped task/title/description/tag search and bounded authorized task reads for other modules.

## Owned persistence

- `list_folders`, `task_lists`, `list_sections`.
- `tasks`, `task_schedules`, `task_recurrences`, `task_occurrence_events`.
- `checklist_items`, `tags`, `task_tags`.

## Public use cases and contracts

- Container commands: create/update/reorder/soft-delete/restore folders and lists; create/update/reorder/delete empty sections; `createPersonalInbox` for identity bootstrap.
- Task commands: create/update/move/reorder/soft-delete/restore and transition among `open`, `completed`, and `cancelled`.
- Detail commands: manage tags and checklist items; set/clear schedule; set/edit supported recurrence; complete, skip, or reopen the current occurrence.
- Queries: get task detail, list/search tasks, load selected open unscheduled tasks, and range-bounded schedule/occurrence reads.
- Parsing: `parseQuickAdd(text, timezone)` returns the unchanged source text plus explicit editable suggestions; it performs no write.
- Public contracts: `TaskDto`, `TaskDetailDto`, `TaskScheduleDto`, `TaskOccurrenceDto`, `TaskQuery`, `TaskVersionRef`, `TaskSnapshotReader`, and narrow mutation services used by assistant/planning/portability.

No public contract exposes a Drizzle row or an unscoped repository method.

## Invariants

- Every SQL read/write is constrained by `user_id`; parent, list, section, tag, and task ownership must agree.
- Exactly one active `kind=inbox` list exists per user. It cannot be renamed to regular, moved to Trash, or deleted.
- A regular list with active tasks is deleted only by an explicit transaction that moves those tasks.
- The active release exposes at most one subtask level; subtasks remain full tasks in the same user and list.
- `status` is the sole current task-state field; `status_changed_at` records its transition time.
- All-day schedules use inclusive `start_date` and exclusive `end_date`; a one-day task ends on the following local date. Timed schedules use UTC `start_at`/`end_at` plus the intent timezone. Representations never mix.
- A schedule or recurrence mutation increments the owning task `version` exactly once in the same transaction.
- Accepted recurrence inputs are only daily, weekdays, weekly on selected days, and monthly by day-of-month. Arbitrary RRULE and completion-relative recurrence are rejected.
- Current recurring-occurrence state is represented by one effective `task_occurrence_events` row keyed by deterministic local occurrence identity; completing one occurrence never completes the series.
- Soft-deleted tasks are absent from normal projections and search. Purge is not exposed.
- Quick add never silently removes or rewrites user text.
- Reminder reconciliation is invoked through a narrow injected port after relevant task/schedule changes; tasks does not own reminder rows or jobs.

## Dependencies

- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- `chrono-node` for suggestions and the approved recurrence library behind a domain value object.
- A composition-injected reminder-reconciliation port; no direct notifications repository import.

## Non-responsibilities

- Smart-view, calendar, agenda, Eisenhower, or deterministic planner projection logic.
- Reminder definitions, push subscriptions/delivery, focus totals, habit state, AI fields, saved filters, collaboration, or import.
- Yearly/custom recurrence, completion-relative recurrence, future-instance overrides beyond the current occurrence, batch editing, Kanban, or timeline.

## Required tests

- Domain tests for status transitions, Inbox immutability, one-level subtasks, checklist behavior, ranks, and container deletion/move rules.
- Database constraint and cross-user denial tests for every aggregate and relationship.
- All-day inclusive/exclusive, timed schedule, spring-forward/fall-back, supported recurrence, series edit, current occurrence, skip, and undo tests.
- Optimistic-version tests proving one increment per accepted aggregate mutation and typed conflicts for stale writes.
- Search ownership/soft-delete tests and seeded query-plan checks.
- Quick-add fixtures proving original text remains intact and suggestions are editable.
