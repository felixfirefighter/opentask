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

- `exportUserData(actor)` opens a consistent read snapshot and composes authorized identity, task, and assistant records.
- `getExportSchemaVersion()` exposes the current document version.
- Public contracts: `UserExportEnvelope`, module-specific export DTOs, and canonical `UserExportSchema`.

The envelope contains `schemaVersion`, export timestamp, portable user profile/preferences, and versioned module sections. Internal database/provider row shapes are never reused directly.

## Invariants

- Export requires a fully authenticated actor and every contributing reader constrains `user_id` in SQL.
- A consistent database snapshot prevents relationships from changing midway through composition.
- Export contains no other user's record and no server secret, password hash, account/session token, rate-limit state, OpenAI key, pg-boss row, or internal provider payload.
- Active structured planner proposals are included; raw brain dumps are absent because they are not persisted.
- IDs and foreign-key references remain stable inside the document; dates use `YYYY-MM-DD` and instants use ISO-8601 UTC strings with explicit timezone fields where intent requires them.
- The entire document validates against exactly one declared schema version before response.
- Export responses use `Cache-Control: private, no-store`; export logs contain metadata only, not content.

## Dependencies

- Authorized public export readers from identity, tasks, and assistant.
- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- No direct cross-module repository or raw Drizzle-row imports.

## Non-responsibilities

- Import, restore, competitor migration, external calendar sync, public API, CLI, MCP server, backup scheduling, or provider credential export.
- Owning or mutating another module's tables.

## Required tests

- Two-user isolation fixture proving the export contains only the caller's records.
- Full seeded export validation against the canonical versioned schema and relationship-integrity checks.
- Secret/redaction tests covering Better Auth, OpenAI, environment, and logs.
- Consistent-snapshot test under concurrent mutation.
- Date/instant/timezone serialization and deterministic envelope/filename tests.
- HTTP authorization, content type, attachment filename, and `Cache-Control: private, no-store` tests.
- Regression test proving no import route, parser, or mutation surface is exposed.
