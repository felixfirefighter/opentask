# Identity module contract

`modules/identity` owns local profile setup, internal workspace bootstrap, server session context, and
user-level preferences. Credential entry is not a product surface. The internal session exists only
to preserve server-side ownership and authorization for the current PostgreSQL-backed workflows.

## Responsibilities

- Render the direct-launch profile setup dialog and cache one validated username in browser local
  storage. The cached value is a display preference, not an authentication credential.
- Bootstrap an isolated workspace through the existing server-side session boundary without asking
  the user to create an account, sign in, or sign out.
- Resolve the internal provider-neutral actor for protected application routes and APIs.
- Atomically bootstrap one personal Inbox and one preferences row for a workspace actor.
- Apply the browser-detected system timezone and read/update week start, hour cycle, theme, and
  reduced-motion preferences.

## Owned persistence

- Internal session/account tables remain an implementation detail of the current workspace bootstrap.
- `user_preferences`.

The locally cached profile username is browser state and must not be persisted as a replacement user
identity or copied into the server auth tables.

## Public use cases and contracts

- `getOptionalSessionIdentity(headers)` resolves the internal session, if present.
- `resolveActor(headers)` returns the provider-neutral actor for protected application work.
- `bootstrapAccount(userId)` opens one transaction, creates preferences, and calls the tasks Inbox
  bootstrap port inside it.
- `enterDemo(headers)` is the internal isolated-workspace bootstrap used by the direct-launch flow.
- `getUserPreferences(actor)` and `updateUserPreferences(actor, expectedVersion, patch)` own the
  canonical preferences contract.
- `getIdentityRequestSecurity()` exposes only trusted-origin configuration needed by the bootstrap
  route.

## Invariants

- A locally cached username is trimmed, non-empty, limited to 64 characters, and never treated as an
  authorization claim.
- The direct-launch flow stores the username locally only after the server workspace bootstrap
  succeeds.
- An internal workspace actor has exactly one preferences row and exactly one active Inbox after
  bootstrap.
- The authenticated browser synchronizes its canonical IANA system timezone to the preferences row;
  a missing or unsupported browser timezone never blocks workspace startup.
- Inbox and preferences creation either both commit or both roll back.
- An unauthenticated internal actor cannot read or mutate domain data; a browser-local username never
  bypasses this rule.
- Demo/workspace data remains isolated by its server actor and reset cannot touch another actor.

## Dependencies

- Better Auth and its Drizzle adapter as an internal server-session implementation only.
- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- Narrow injected Inbox-bootstrap and demo-dataset ports; identity does not deep-import feature
  repositories.

## Non-responsibilities

- Public account creation, sign-in, sign-out, password forms, email verification, password reset,
  social login, passkeys, MFA, billing, collaboration, memberships, or workspaces.
- Task/list authorization or persistence beyond coordinating Inbox bootstrap.
- Domain seed implementation for tasks or planner proposals.

## Required tests

- Direct-launch username validation, local-storage persistence, bootstrap success/error, and offline
  behavior tests.
- Protected-route fallback to direct launch and safe resume intent.
- Internal session and cross-user authorization tests for every protected API remain required even
  though credential entry is not exposed.
- Fresh-workspace transaction, preference schema/conflict, and demo isolation tests.
