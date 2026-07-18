# Data model contract

Read this document before any schema change. It defines semantic ownership and placement rules; module documents define behavior. SQL names are `snake_case`; TypeScript names are `camelCase`.

## Core rules

1. PostgreSQL and committed SQL migrations are the source of persisted truth.
2. Views such as Today, Calendar, Matrix, and Agenda are queries over canonical rows, never duplicate task tables.
3. Every user-owned aggregate is scoped by `user_id` in its repository query and protected by application authorization tests.
4. UUIDv4 IDs are generated client/server-side with `crypto.randomUUID()` where retry idempotency matters.
5. User-facing aggregates carry `version`, `created_at`, and `updated_at`. An accepted mutation increments `version` exactly once.
6. Soft deletion exists only where Trash/undo is part of behavior; it is not added reflexively to joins or immutable events.
7. All instants are `timestamptz`; all-day and habit calendar days are PostgreSQL `date`; timezones are IANA names.
8. Foreign keys, unique constraints, checks, and indexes encode invariants that can be expressed in PostgreSQL.
9. Database rows never leave infrastructure. Repositories translate rows into application DTOs/domain values.
10. No production schema push. Generate and review a migration, then run migration smoke tests.

## Placement test: column, table, or document

Classify new data before implementing it.

| Shape | Placement |
|---|---|
| Stable scalar that belongs to the aggregate and is queried/sorted/constrained | Typed column on the owning table |
| Repeating value | Child table |
| Many-to-many relationship | Join table |
| Optional concept with its own rules/lifecycle | One-to-one extension table |
| Append-only occurrence/history/delivery | Event table |
| Provider-specific data | Provider/integration table, never a task column |
| Short-lived/versioned document not queried by individual fields | Explicit approved JSONB extension point with Zod schema |
| Hypothetical future need | Do not store it |

Examples:

- A second reminder is a new `task_reminders` row in a later release, not `reminder_2_at`.
- A task's start/end belongs to `task_schedules`, not another `deadline` column.
- Completion of a recurring occurrence belongs to `task_occurrence_events`, not a cloned task.
- Google Calendar event metadata belongs to a future integration mapping table, not `tasks.google_event_id`.
- A planner proposal is a short-lived versioned JSON document; JSONB is appropriate.

## Approved JSONB extension points

No other JSONB column may be added without changing this document and the stack/architecture audit.

| Table/field | Why JSONB is appropriate | Required control |
|---|---|---|
| `user_preferences.preferences` | bounded per-user configuration not queried across users | `schema_version` plus canonical Zod schema and migrations between versions |
| `planner_proposals.proposal` | short-lived structured diff whose schema evolves with prompt/application contract | `schema_version`, Zod validation at read/write, expiry |
| `planner_proposals.context_versions` | bounded map used only to detect stale proposal application | Zod record of opaque ID -> integer version |

Future saved-filter AST, integration raw payload, or idempotency response documents require an explicit new whitelist entry. Generic `metadata`, EAV, and arbitrary custom fields are forbidden.

## Canonical vocabulary

Use these names. Do not introduce synonyms.

| Concept | Canonical name | Do not add |
|---|---|---|
| tenant/record owner | `user_id` | `owner`, `account_owner_id`, `tenant_id` for the same release model |
| task container | `list_id` | `project_id`, `bucket_id` |
| parent task | `parent_task_id` | `parent_id`, `root_task_id` |
| optimistic revision | `version` | `revision`, `lock_version` |
| order | `rank` | `position`, `order`, `sort_index` |
| soft deletion | `deleted_at` | `is_deleted`, `trashed` |
| task state | `status` | separate `is_complete`/`is_cancelled` flags |
| state transition time | `status_changed_at` | `completed_at` and `cancelled_at` duplicates in active model |
| timed schedule | `start_at`, `end_at` | `due_at`, `deadline_at` |
| all-day schedule | `start_date`, `end_date` | midnight UTC timestamps |
| local calendar day | `local_date` | ambiguous timestamp |
| recurrence occurrence identity | `occurrence_key` | generated task ID copies |

If later requirements genuinely need different meanings, update the vocabulary with explicit definitions rather than overloading a name.

## Table catalog and ownership

### Better Auth managed tables

`user`, `session`, `account`, `verification`, and any Better Auth rate-limit table are generated/owned by the identity infrastructure. Do not place product profile/preferences or domain authorization inside auth tables.

### `user_preferences` — identity

One row per user.

- `user_id` PK/FK
- `schema_version`
- `preferences` JSONB: timezone, week start, hour cycle, theme, reduced motion
- `version`, `created_at`, `updated_at`

The timezone must be a validated IANA zone. The application bootstrap creates this row and the Inbox atomically.

### `list_folders` — tasks

- `id`, `user_id`, `name`, `rank`
- `version`, `created_at`, `updated_at`, `deleted_at`
- unique active folder name per user is optional UX policy, not a hard invariant

### `task_lists` — tasks

- `id`, `user_id`, nullable `folder_id`, `name`, `color_token`, `rank`, `kind`
- `kind` is `inbox` or `regular`; exactly one active Inbox per user via partial unique index
- `version`, `created_at`, `updated_at`, `deleted_at`

Folder ownership must match list ownership; enforce in application and denial tests. A list cannot be deleted while it owns active tasks unless the mutation explicitly moves them.

### `list_sections` — tasks

- `id`, `user_id`, `list_id`, `name`, `rank`
- `version`, `created_at`, `updated_at`

Sections are hard-deleted only when empty or in the same transaction that moves their tasks. They do not need Trash behavior.

### `tasks` — tasks

Stable task identity/state only:

- `id`, `user_id`, `list_id`, nullable `section_id`, nullable `parent_task_id`
- `title`, `description_md`
- `status`: `open`, `completed`, `cancelled`
- `priority`: `none`, `low`, `medium`, `high`
- `rank`, `status_changed_at`
- `version`, `created_at`, `updated_at`, `deleted_at`

Constraints/policies:

- nonblank bounded title;
- parent task belongs to same user and list;
- active release permits one exposed subtask level; domain policy rejects deeper creation even though the self-FK can support later depth;
- section belongs to the same list;
- status is the only current-state representation;
- soft-deleted tasks are excluded from all normal projections/search.

Do not add schedule, reminder, recurrence, tag arrays, checklist JSON, focus totals, habit state, calendar color, or AI fields here.

### `task_schedules` — tasks

One optional row per scheduled task:

- `task_id` PK, `user_id`, `kind`: `all_day` or `timed`
- all-day: `start_date`, `end_date` inclusive/exclusive contract documented in task module
- timed: `start_at`, `end_at`, `timezone`
- `created_at`, `updated_at`

Check constraints require exactly the fields for `kind`, `end >= start`, and no mixed date/instant representation. A schedule mutation increments the owning task version in the same transaction.

### `task_recurrences` — tasks

One optional row per recurring task:

- `task_id` PK, `user_id`
- `rrule` text, `timezone`, `generation_mode`
- `generation_mode` is fixed to `schedule` in active scope; completion-relative mode is reserved in domain vocabulary but not accepted by API
- `created_at`, `updated_at`

RRULE is validated by the tasks domain wrapper; UI/API accepts only active-scope presets even if the library parses more.

### `task_occurrence_events` — tasks

Append-only effective state for a recurring occurrence:

- `id`, `user_id`, `task_id`, `occurrence_key`
- `state`: `completed`, `skipped`, `open`
- `effective_at`, `created_at`
- unique effective row per task/occurrence; an undo updates/replaces through one application policy rather than creating conflicting states

`occurrence_key` is derived deterministically from the series timezone/local occurrence, not a display string. Past events remain when a series rule changes.

### `checklist_items` — tasks

- `id`, `user_id`, `task_id`, `title`, `is_completed`, `rank`
- `version`, `created_at`, `updated_at`

Checklist items are not tasks and do not receive task schedules/tags in active scope. Completing all items does not silently complete the parent unless the module contract explicitly changes.

### `tags` and `task_tags` — tasks

`tags`: `id`, `user_id`, `name`, `color_token`, `version`, timestamps, optional `deleted_at`.

`task_tags`: `user_id`, `task_id`, `tag_id`, composite PK. No timestamps/version unless a real behavior later needs them.

Normalize tag name for uniqueness per user; preserve the display spelling in one canonical field.

### `task_reminders` — notifications

Active release permits zero or one row per task through a unique `task_id` constraint:

- `id`, `user_id`, `task_id`, `kind`: `absolute` or `relative_start`
- `remind_at` for absolute, or `offset_minutes` for relative
- `enabled`, `version`, timestamps

A later move to multiple reminders removes the unique constraint; it does not add task columns.

### `push_subscriptions` — notifications

- `id`, `user_id`, `endpoint_hash`
- encrypted endpoint, `p256dh`, and auth material
- device label/user-agent summary, `created_at`, `last_used_at`, `revoked_at`
- unique active endpoint hash per user

Encryption uses a server-only data-encryption key with key-version metadata. Never return stored secret material except as required to send from the worker.

### `notification_deliveries` — notifications

- `id`, `user_id`, `reminder_id`, nullable `occurrence_key`
- `scheduled_for`, `state`, `attempt_count`, nullable `last_error_code`, `delivered_at`
- deterministic `idempotency_key` unique
- timestamps

Jobs contain this ID/reminder ID, not content. Retention cleanup is a worker job.

### `habits` — habits

- `id`, `user_id`, `title`, `icon`, `color_token`
- `goal_kind`: `boolean` or `quantity`; `target_value`, nullable `unit`
- `version`, `created_at`, `updated_at`, `archived_at`

### `habit_schedules` — habits

One row per habit in active scope:

- `habit_id` PK, `user_id`, `kind`: `daily`, `weekdays`, `weekly_target`
- `weekdays` smallint array for selected weekdays; `target_per_week` for weekly target
- `timezone`, `start_date`, nullable `end_date`
- timestamps

Checks enforce the fields allowed for each discriminant. A schedule change increments the habit version.

### `habit_logs` — habits

- `id`, `user_id`, `habit_id`, `local_date`
- `state`: `completed`, `skipped`, `unachieved`
- nullable `quantity`, nullable bounded `note`
- `version`, `created_at`, `updated_at`
- unique habit/local date

Streaks and heat maps are projections; do not store counters on `habits`.

### `focus_sessions` — focus

- `id`, `user_id`, nullable `task_id`, nullable `habit_id`
- `mode`: `pomodoro` or `stopwatch`
- `state`: `active`, `paused`, `completed`
- `started_at`, nullable `paused_at`, accumulated active seconds, nullable `planned_seconds`, nullable `ended_at`
- `version`, `created_at`, `updated_at`

A partial unique index permits one `active`/`paused` session per user. Historical links use `ON DELETE SET NULL` only if the referenced aggregate can be hard-purged later; soft deletion keeps normal links readable.

### `planner_proposals` — assistant

- `id`, `user_id`, `planning_date`, `schema_version`
- `proposal` JSONB, `context_versions` JSONB
- `status`: `pending`, `applied`, `expired`, `rejected`
- `model`, `prompt_version`, `idempotency_key`
- `created_at`, `expires_at`, nullable `applied_at`

Do not persist the raw brain dump by default. The proposal contains only the reviewable structured diff. Apply is one transaction and status/idempotency key make retries safe.

## Required indexes

At minimum, migration review checks:

- user/active/rank indexes for folders, lists, sections, tasks;
- tasks by `(user_id, status, status_changed_at)`;
- schedules by `(user_id, start_at/end_at)` and `(user_id, start_date/end_date)`;
- GIN/trigram indexes for scoped task search after measuring query form;
- unique task/occurrence and habit/local-date constraints;
- reminders by user/enabled and deliveries by scheduled/state;
- partial unique active focus session;
- planner proposals by user/status/expiry;
- every foreign-key column used in deletion/authorization joins.

Do not add speculative indexes. Use `EXPLAIN (ANALYZE, BUFFERS)` against seeded data before performance claims.

## Migration protocol

1. Run the repository schema inventory command and `rg` for the proposed concept.
2. Update this catalog and owning module contract first or in the same patch.
3. Change only the owning module's schema file; the global schema index re-exports definitions only.
4. Generate SQL; inspect every statement, constraint, default, index, and destructive warning.
5. Add/adjust empty-database, upgrade, constraint, and cross-user authorization tests.
6. Run migration on a fresh database and a seeded prior schema.
7. Provide a rollback/forward-fix note in the migration review, not a permanent planning diary.

`drizzle-kit push` is local throwaway exploration only and must not be exposed as the normal project command.

## Schema audit checklist

- Does the concept already exist under a canonical name?
- Is the owning module clear?
- Is this scalar, repeating, relational, historical, provider-specific, or versioned document data?
- Can a projection derive it instead of persisting it?
- Are ownership and same-parent constraints enforceable?
- Are nullability and deletion behavior explicit?
- Does time data distinguish instant from local date?
- Does a new JSONB field appear on the whitelist?
- Does the mutation increment exactly one aggregate version?
- Are migration and denial tests present?

If any answer is unclear, the schema change is not ready.
