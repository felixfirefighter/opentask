# Portability module contract

`modules/portability` owns the authenticated, versioned JSON export contract. The active release has no import or restore path.

## Responsibilities

- Compose one consistent export of the caller's portable release data through authorized public module readers.
- Validate the complete export against a documented versioned Zod schema.
- Preserve stable IDs and relationships, local dates, instants, timezones, statuses, and user-authored content needed for future portability.
- Exclude credentials, sessions, provider secrets, queue internals, and server configuration.
- Return the export with no-store/private response headers and a deterministic filename.

## Owned persistence

- None.
- Export is generated on request and is not cached or stored server-side.

## Public use cases and contracts

- `exportUserData(actor)` opens a consistent read snapshot and composes authorized identity, tasks,
  assistant, habits, Focus, and notifications records through their public export readers.
- `USER_EXPORT_SCHEMA_VERSION` exposes the current document version through the module root.
- Public contracts: `UserExportEnvelope`, module-specific export DTOs, and canonical `UserExportSchema`.

The envelope contains `schemaVersion`, export timestamp, portable user profile/preferences, and
independently versioned module sections. An envelope bump records a composition change; a module
section version changes only when that section changes. The current envelope and tasks section use
versions 3 and 2 respectively; habits, identity, and assistant use section version 1. Focus and
notification sections join through later package-owned envelope bumps. Internal database/provider
row shapes are never reused directly.

## Invariants

- Export requires a fully authenticated actor and every contributing reader constrains `user_id` in SQL.
- A consistent database snapshot prevents relationships from changing midway through composition.
- Export contains no other user's record and no server secret, password hash, account/session token, rate-limit state, OpenAI key, pg-boss row, or internal provider payload.
- Task data includes normalized recurrence rules with checked lower/optional-upper cutovers and
  append-only occurrence events without cloned task instances. Canonical opaque occurrence identities
  are preserved in either the bounded `o1` or `o2` task-owned format; portability validates but does
  not decode or rewrite them. An explicitly ended series normally retains its upper-bounded
  definition; clearing its schedule may leave events without a current recurrence definition.
  Relationships still require every rule/event to reference an exported task, every rule to have one
  compatible exported schedule, unique per-task rule/event-version identities, and
  `event.taskVersion <= task.version`.
- Habit data includes definitions, schedules, and local-day logs; streaks and heat maps remain
  derivable and are not exported as stored facts.
- Focus data includes completed `kind=focus` session history only. Break rows and an active/paused
  authoritative timer are operational state and are not represented as portable completed focus.
- Reminder data includes the stable task relationship and portable absolute/relative specification.
  Push subscriptions, encrypted endpoint/key material, notification deliveries/idempotency state,
  and pg-boss queue rows are excluded.
- Active structured planner proposals are included; raw brain dumps are absent because they are not
  persisted.
- IDs and foreign-key references remain stable inside the document; dates use `YYYY-MM-DD` and instants use ISO-8601 UTC strings with explicit timezone fields where intent requires them.
- The entire document validates against exactly one declared schema version before response.
- Export responses use `Cache-Control: private, no-store`; export logs contain metadata only, not content.

## Dependencies

- Authorized public export readers from identity, tasks, assistant, habits, Focus, and notifications.
- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- No direct cross-module repository or raw Drizzle-row imports.

## Non-responsibilities

- Import, restore, competitor migration, external calendar sync, public API, CLI, MCP server, backup
  scheduling, or provider credential export.
- Owning or mutating another module's tables.

## Required tests

- Two-user isolation fixture proving the export contains only the caller's records.
- Full seeded export validation across task recurrence/occurrences, habits, completed Focus, and
  reminder specifications against the canonical versioned schema and relationship-integrity checks.
- Secret/redaction tests covering Better Auth, OpenAI, push subscriptions, endpoint/key material,
  deliveries/queue state, environment, and logs.
- Consistent-snapshot test under concurrent mutation.
- Date/instant/timezone serialization and deterministic envelope/filename tests.
- Regression test proving active/paused Focus sessions, break rows, derived habit counters, push secrets,
  notification delivery/idempotency state, and queue internals are absent.
- HTTP authorization, content type, attachment filename, and `Cache-Control: private, no-store` tests.
- Regression test proving no import route, parser, or mutation surface is exposed.
