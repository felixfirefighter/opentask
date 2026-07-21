# Data model contract

Read this document before any schema change. It defines semantic ownership and placement rules; module documents define behavior. SQL names are `snake_case`; TypeScript names are `camelCase`.

## Core rules

1. PostgreSQL and committed SQL migrations are the source of persisted truth.
2. Views such as Today, Calendar, Matrix, and Agenda are queries over canonical rows, never duplicate task tables.
3. Every user-owned aggregate is scoped by `user_id` in its repository query and protected by application authorization tests.
4. UUIDv4 IDs are generated client/server-side with `crypto.randomUUID()` where retry idempotency
   matters. A client-generated user-owned aggregate ID is identified by `(user_id, id)`, never by
   `id` alone; another user's use of the same UUID cannot conflict with or reveal the first row.
5. Mutable user-facing aggregates carry `version`, `created_at`, and `updated_at`. A one-to-one
   extension shares its owning aggregate's version; an immutable event has no update/version
   columns. An accepted mutation increments exactly one owning aggregate version once.
6. Soft deletion exists only where Trash/undo is part of behavior; it is not added reflexively to joins or immutable events.
7. All instants are `timestamptz`; all-day calendar values are PostgreSQL `date`; timezones are IANA names.
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

- A later second reminder would be another `task_reminders` row after an authorized scope change,
  not `reminder_2_at`; the active release permits zero or one reminder per task.
- A task's start/end belongs to `task_schedules`, not another `deadline` column.
- A recurring-occurrence transition belongs to `task_occurrence_events`, not a cloned task.
- Google Calendar event metadata belongs to a future integration mapping table, not `tasks.google_event_id`.
- A planner proposal is a short-lived versioned JSON document; JSONB is appropriate.

## Approved JSONB extension points

No other JSONB column may be added without changing this document and the stack/architecture audit.

| Table/field | Why JSONB is appropriate | Required control |
|---|---|---|
| `user_preferences.preferences` | bounded per-user configuration not queried across users | `schema_version` plus canonical Zod schema and migrations between versions |
| `planner_proposals.proposal` | short-lived structured diff whose schema evolves with prompt/application contract | `schema_version`, Zod validation at read/write, expiry |
| `planner_proposals.context_versions` | bounded map used only to detect stale proposal application | Zod record of opaque ID -> integer version |
| `companion_behavior_summaries.summary` | bounded, replaceable derived profile not queried by individual field | schema version plus canonical Zod validation |

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

## Core scalar and ordering bounds

These limits are shared by PostgreSQL checks and strict application schemas:

- folder, list, section, and tag names: 1–120 characters after ECMAScript `String.trim`;
- task and checklist titles: 1–500 characters after ECMAScript `String.trim`;
- task Markdown descriptions: at most 20,000 characters;
- fractional ranks: 1–128 characters, generated only by the tasks application service;
- optimistic versions: positive PostgreSQL integers up to 2,147,483,647;
- task/list/tag color tokens: `coral`, `amber`, `mint`, `sky`, `violet`, or `slate`.

Required names, titles, and ranks cannot retain an ECMAScript `String.trim` character at either
boundary; PostgreSQL checks use that explicit character set rather than its narrower one-argument
`btrim` default. All user-authored text must be well-formed Unicode and must not contain U+0000. The
shared request schemas and task-domain normalization enforce this so PostgreSQL stores and replays
text losslessly.

Create idempotency uses the actor-scoped `(user_id, id)` pair containing the client-generated UUIDv4
aggregate `id`; there is no parallel idempotency table or response document. An ID remains reserved
for that user while its row exists, including soft-deleted rows. Hard-deleting a section or checklist
item releases its ID for that user because those nested resources have no restore contract.
Fractional ranks are scoped as documented by the tasks module, use `(rank, id)` as their
deterministic order, and may be rewritten only by its bounded rebalance transaction. Every persisted
`rank` column uses PostgreSQL's explicit `"C"` collation so database comparisons, ordering indexes,
cursors, and the JavaScript fractional-key service share the same bytewise lexical order on every
deployment.

## Table catalog and ownership

Every unqualified heading below belongs to the Local-first Full Release target schema. A table is
implemented only in its ordered work package and reviewed migration; this catalog authorizes the
target shape but does not make a not-yet-migrated table current database state. Stage A–D concepts
remain migration prohibitions until a later user-authorized scope change.

The client-ID aggregates `list_folders`, `task_lists`, `list_sections`, `tasks`,
`checklist_items`, and `tags` use tenant-leading composite primary keys `(user_id, id)`. Their owning
foreign keys also begin with `user_id`; UUID equality never supplies authorization or global
uniqueness.

### Better Auth managed tables

`user`, `session`, `account`, `verification`, and any Better Auth rate-limit table are generated/owned by the identity infrastructure. Do not place product profile/preferences or domain authorization inside auth tables.

### `user_preferences` — identity

One row per user.

- `user_id` PK/FK
- `schema_version`
- `preferences` JSONB: timezone, week start, hour cycle, theme, reduced motion, onboarding completion,
  selected goals, and the capped last 30 daily check-ins
- `schema_version` is currently `2`; version 2 adds the bounded onboarding document and migrates
  existing rows with setup incomplete and no check-ins
- `version`, `created_at`, `updated_at`

The timezone must be a validated IANA zone. The application bootstrap creates this row and the Inbox atomically.

### `openai_credentials` — assistant

One optional profile-owned provider credential. This is a provider-specific table, not a preference
JSON field:

- `user_id` PK/FK with cascade on profile deletion
- `encrypted_api_key`, `initialization_vector`, `authentication_tag`
- `encryption_version`, `created_at`, `updated_at`

The plaintext key is never persisted, exported, logged, or returned to the browser. A personal key
overrides the server `OPENAI_API_KEY`; removing the row restores that fallback.

### `companion_profiles`, `companion_xp_events`, and `companion_behavior_summaries` — companion

`companion_profiles` is one user-owned optional progression extension with total XP, derived level,
proactive-message preference, communication style, schema/version, and timestamps. `companion_xp_events`
is an append-only user-scoped award ledger with opaque source key, action type, positive bounded XP,
local date, and unique `(user_id, action_type, source_key)` idempotency. `companion_behavior_summaries`
holds one replaceable versioned JSONB aggregate summary and its bounded observation window. Raw chat,
task text snapshots, model traces, and psychological inferences are never stored.

`companion_memories` contains only explicit, user-approved bounded memory cards. It is not a chat log;
the application enforces a 30 MiB UTF-8 user quota and evicts oldest cards before accepting a new one.

### `saved_prompts` and `saved_prompt_tags` — prompts

Level 3 unlocks an independent reusable-prompt library. `saved_prompts` owns explicit user content,
reviewable Ameth-generated title/description, optimistic version, archive state, and timestamps.
`saved_prompt_tags` is a repeating prompt-local tag relation with a composite same-owner foreign key to
`saved_prompts`. Prompt tags never reuse task tags, and
analysis never saves automatically: the user edits/reviews metadata before creation.

The private export envelope is schema version 2. It includes companion profile, XP ledger, summary,
approved memory cards, and saved prompts/tags, but never raw chat transcripts or OpenAI credentials.

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
- parent task belongs to the same user and list, enforced by a composite foreign key that is
  deferred until transaction commit so an atomic root-tree list move can update the root before its
  direct children;
- active release permits one exposed subtask level; domain policy rejects deeper creation even though the self-FK can support later depth;
- section belongs to the same list;
- status is the only current-state representation;
- soft-deleted tasks are excluded from all normal projections/search.

Do not add schedule, reminder, recurrence, tag arrays, checklist JSON, focus totals, habit state, calendar color, or AI fields here.

### `task_schedules` — tasks

One optional row per scheduled task; its owning foreign key is tenant-leading:

- `user_id`, `task_id` composite PK/FK, `kind`: `all_day` or `timed`
- all-day: `start_date`, `end_date` inclusive/exclusive contract documented in task module
- timed: `start_at`, `end_at`, `timezone`
- `created_at`, `updated_at`

Check constraints require exactly the fields for `kind`, no mixed date/instant representation,
`end_date > start_date` for the inclusive/exclusive all-day interval, and `end_at >= start_at` for a
timed schedule (including a zero-duration point-in-time task). A schedule mutation increments the
owning task version in the same transaction.

### `task_recurrences` — tasks

One optional row per recurring task; its owning foreign key is tenant-leading:

- `user_id`, `task_id` composite PK/FK
- `rrule` text, `timezone`, `generation_mode`
- nullable `projection_start_date`, nullable `projection_start_at`
- `generation_mode` is `schedule`; completion-relative generation remains outside the active release
- `created_at`, `updated_at`

`rrule` is a normalized internal serialization generated and validated by the tasks domain wrapper;
it does not contain a second `DTSTART`, because `task_schedules` is the only series anchor. The
UI/API accepts only daily, weekdays, weekly selected-weekday, monthly day-of-month, and yearly
month/day presets with a bounded interval and never/until/count endings; it never accepts arbitrary
RRULE text. The owning task must be an open, non-deleted, scheduled root task. Schedule or rule
changes increment the owning task version once in the same transaction. A timed recurrence timezone
must equal its schedule timezone; an all-day recurrence retains the validated IANA zone used to
interpret the rule when it is created/edited.

Exactly one projection cutover is present: `projection_start_date` for an all-day schedule or
`projection_start_at` for a timed schedule. A row check enforces the exclusive discriminant; the
application transaction also verifies it matches the owning schedule kind. On initial rule creation,
the cutover equals the canonical schedule anchor. An edit replaces the one mutable rule and chooses a
server-controlled future date/instant at or after which the new rule may project. Recorded earlier
events remain immutable; unrecorded occurrences before the current cutover are deliberately not
reconstructed. The cutover is an expansion lower bound, not a second task schedule.

### `task_occurrence_events` — tasks

Append-only effective state for a recurring occurrence:

- `id`, `user_id` composite PK, `task_id`, `occurrence_key`
- `state`: `completed`, `skipped`, `open`
- `task_version`: the owning task's post-command version
- `effective_at`, `created_at`; both are server-controlled instants
- its owning task foreign key is tenant-leading; events are immutable after insertion
- unique `(user_id, task_id, task_version)`; complete, skip, and undo append `completed`, `skipped`,
  and `open` transitions rather than overwriting history

`occurrence_key` is derived deterministically from the series identity and canonical all-day local
date or timed start instant, not a display string. A transition serializes through the owning task
aggregate so a replayed/no-op command does not append a duplicate event, and accepted changes
increment the task version exactly once. Effective state is the event with the greatest
`task_version`; timestamps and UUIDs are audit data, not causal ordering. Past events and keys remain
stable when a series rule changes or ends, even when the old unrecorded projection is no longer
reconstructable.

### `checklist_items` — tasks

- `id`, `user_id`, `task_id`, `title`, `is_completed`, `rank`
- `version`, `created_at`, `updated_at`

Checklist items are not tasks and do not receive task schedules/tags in active scope. Completing all items does not silently complete the parent unless the module contract explicitly changes.

### `tags` and `task_tags` — tasks

`tags`: `id`, `user_id`, `name`, `color_token`, `version`, timestamps, optional `deleted_at`.

`task_tags`: `user_id`, `task_id`, `tag_id`, composite PK. No timestamps/version unless a real behavior later needs them.

Normalize tag names with `lower(normalize(name, NFKC))` for active uniqueness per user; preserve the
display spelling in the canonical `name` field.

### `task_reminders` — notifications

The active release permits zero or one row per task through a unique `(user_id, task_id)` constraint
and a tenant-leading owning foreign key:

- `id`, `user_id` composite PK, `task_id`, `kind`: `absolute` or `relative_start`
- `remind_at` for absolute, or `offset_minutes` for relative
- `enabled`, `version`, timestamps

A later move to multiple reminders removes the unique constraint; it does not add task columns.

An `absolute` reminder is valid only while its task is non-recurring. A recurring task accepts only
`relative_start`, resolved against each eligible occurrence start. Setting recurrence on a task with
an absolute reminder must require an explicit reminder conversion/removal in the same reviewed user
flow; it cannot silently reinterpret the instant.

### `push_subscriptions` — notifications

- `id`, `user_id` composite PK, `endpoint_hash`
- encrypted endpoint, `p256dh`, and auth material plus encryption-key-version metadata
- device label/user-agent summary, `created_at`, `last_used_at`, `revoked_at`
- unique active endpoint hash per user

Encryption uses a server-only data-encryption key with key-version metadata. Never return stored secret material except as required to send from the worker.

### `notification_deliveries` — notifications

- `id`, `user_id` composite PK, `reminder_id`, `subscription_id`, nullable `occurrence_key`
- `scheduled_for`, `state`, `attempt_count`, nullable `last_error_code`, `delivered_at`
- deterministic `idempotency_key` unique
- timestamps

The reminder and subscription foreign keys are tenant-leading. One logical delivery is scoped to one
subscription and one task occurrence/one-shot reminder; its deterministic idempotency key includes
those opaque identities. Jobs contain the delivery ID/reminder ID, not content. Retention cleanup is
a worker job.

### `habits` — habits

- `id`, `user_id` composite PK, `title`, `icon`, `color_token`
- `goal_kind`: `boolean` or `quantity`; `target_value`, nullable `unit`
- `version`, `created_at`, `updated_at`, `archived_at`

Checks require a positive `target_value` and bounded unit for quantity goals and reject quantity-only
fields for boolean goals.

### `habit_schedules` — habits

One row per habit:

- `user_id`, `habit_id` composite PK/FK, `kind`: `daily`, `weekdays`, `weekly_target`
- `weekdays` smallint array for selected weekdays; `target_per_week` for weekly target
- `timezone`, `start_date`, nullable `end_date`
- timestamps

Checks enforce the fields allowed for each discriminant, unique ISO weekday values, a positive
weekly target, a valid IANA timezone, and an inclusive `end_date >= start_date` when an end exists.
A schedule change increments the habit version once in the same transaction.

### `habit_logs` — habits

- `id`, `user_id` composite PK, `habit_id`, `local_date`
- `state`: `completed`, `skipped`, `unachieved`
- nullable `quantity`, nullable bounded `note`
- `version`, `created_at`, `updated_at`
- unique `(user_id, habit_id, local_date)` with a tenant-leading owning foreign key

Streaks and heat maps are projections; do not store counters on `habits`.

### `focus_sessions` — focus

- `id`, `user_id` composite PK, nullable `task_id`, nullable `habit_id`
- `kind`: `focus` or `break`
- `mode`: `pomodoro` or `stopwatch`
- `state`: `active`, `paused`, `completed`
- `started_at`, nullable `paused_at`, `accumulated_active_seconds`, nullable `planned_seconds`, nullable `ended_at`
- `version`, `created_at`, `updated_at`

A check permits at most one of `task_id` and `habit_id`; both links use tenant-leading ownership.
`kind=focus` may use either mode and may link one item. `kind=break` requires `mode=pomodoro`, requires
both links to be null, and is started only by an explicit user command. Both kinds use
`planned_seconds` for their per-run duration when bounded; there is no persisted duration preference.
A partial unique index permits one `active`/`paused` session per user. Historical links use `ON
DELETE SET NULL` only if the referenced aggregate can be hard-purged later; soft deletion keeps
normal links readable. Checks also require nonnegative accumulated seconds, a positive
`planned_seconds` for every Pomodoro focus or break row, a null `planned_seconds` for stopwatch
rows, and `ended_at` only for completed sessions. `created_at` is the
immutable session origin; `started_at` is the current/last active-segment anchor and is reset on
resume. Active rows have no pause/end instant, paused rows require `paused_at` and no `ended_at`, and
completed rows require `ended_at`.

Only completed `kind=focus` rows contribute to today/seven-day totals and portable focus history.
Break rows remain authoritative enough to reconnect the running countdown, but are excluded from
focus totals and export.

### `planner_proposals` — assistant

- `id`, `user_id`, `planning_date`, `schema_version`
- `proposal` JSONB, `context_versions` JSONB
- `status`: `pending`, `applied`, `expired`, `rejected`
- `model`, `prompt_version`, `idempotency_key`
- `created_at`, `expires_at`, nullable `applied_at`

Do not persist the raw brain dump by default. The proposal contains only the reviewable structured diff. Apply is one transaction and status/idempotency key make retries safe.

## Required indexes

At minimum, migration review checks:

- user/active/rank indexes for folders, lists, sections, and task roots, plus active subtasks by
  `(user_id, list_id, parent_task_id, rank, id)`;
- tasks by `(user_id, status, status_changed_at)`;
- schedules by `(user_id, start_at/end_at)` and `(user_id, start_date/end_date)`;
- recurrence by `(user_id, task_id)` and occurrence events by
  `(user_id, task_id, occurrence_key, task_version)` for latest-state lookup;
- active habits and habit schedules by user, habit logs by user/habit/local date and user/local date;
- the partial one-unfinished-Focus-session index plus completed Focus history by user/end time;
- reminders by user/task, active subscriptions by user/endpoint hash, and deliveries by unique
  idempotency key plus user/state/scheduled time;
- GIN/trigram indexes for scoped task search after measuring query form;
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
- Is the table listed in this active target catalog and assigned to the current work package rather
  than only later scope?
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
