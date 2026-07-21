# Identity module contract

`modules/identity` owns account bootstrap and user-level preferences. Better Auth owns credential and session mechanics; feature modules remain responsible for authorization of their records.

## Responsibilities

- Mount and configure Better Auth for email/password sign-up, sign-in, sign-out, database sessions, and protected request context.
- Atomically bootstrap one personal Inbox and one preferences row for a newly created user.
- Read and update timezone, week start, hour cycle, theme, and reduced-motion preferences.
- Create or reset an isolated demo user dataset through injected module seed/reset ports; never expose shared credentials.

## Owned persistence

- Better Auth-managed `user`, `session`, `account`, `verification`, and rate-limit tables.
- `user_preferences`.

Product fields and domain permissions do not belong in Better Auth tables.

## Public use cases and contracts

- `bootstrapAccount(userId)` opens one transaction, creates preferences, and calls the tasks
  Inbox-bootstrap port inside it. The private application factory may reuse an existing transaction
  when Better Auth creates an account.
- `getUserPreferences(actor)` returns the canonical, schema-versioned preferences DTO.
- `updateUserPreferences(actor, expectedVersion, patch)` validates and updates preferences once.
- `enterDemo(headers)` creates or resets an isolated demo identity after the route has validated the
  request, then restores canonical preferences and delegates domain seeding through
  `DemoDatasetSeeder` in one transaction. Identity captures one `resetAt` before opening the reset
  transaction and passes it explicitly to both preferences and the seeder; the default adapter uses
  that immutable instant for planner proposals, tasks, habits, Focus, and the portable reminder
  definition without opening a nested transaction or consulting a second clock. Notification reset
  removes subscriptions and delivery internals instead of pre-granting browser permission.
- `getIdentityRequestSecurity()` exposes the exact trusted browser origins without leaking
  provider configuration or secrets.
- Public contracts: `AuthenticatedActor`, `UserPreferences`, `UserPreferencesPatch`, `InboxBootstrapPort`, and `DemoDatasetSeeder`.

Request/session extraction is exposed through the identity module's root application surface and
returns the provider-neutral contract from `shared/auth`; it must not expose Better Auth row or token
types.

## Invariants

- A user has exactly one `user_preferences` row and exactly one active Inbox after bootstrap.
- Inbox and preferences creation either both commit or both roll back.
- Timezone is a valid IANA name; week start, hour cycle, theme, and reduced-motion values are closed enums/booleans from the canonical Zod schema.
- An accepted preference mutation checks ownership and `version`, then increments `version` exactly once.
- A demo reset restores `defaultPreferenceDocument` and increments the current preference version
  exactly once; it never rewinds or bypasses optimistic version history.
- An unauthenticated actor cannot read or mutate domain data.
- Demo data is owned by its isolated demo user and reset cannot touch any other user.
- Demo preference, planner-proposal, task, habit, Focus, and notification resets share one captured
  reset instant and commit or roll back together. Focus rows are cleared before task/habit
  replacement and seeded only after their linked fixtures exist. The notification fixture is seeded
  after its linked task and contains no subscription or delivery record.
- Auth and demo abuse controls derive the client address from the same `X-Real-IP` policy. Production
  ingress must overwrite that header and prevent direct origin access; an unresolved address uses a
  shared fallback bucket.
- When the configured browser origin uses `localhost` or `127.0.0.1`, the other loopback spelling is
  trusted only with the same scheme and port. Non-loopback deployments trust only the configured
  origin; wildcard origins are forbidden.

## Dependencies

- Better Auth and its Drizzle adapter.
- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- Narrow injected Inbox-bootstrap and demo-dataset ports; identity does not deep-import feature repositories.

## Non-responsibilities

- Task/list authorization or persistence beyond coordinating Inbox bootstrap.
- Social login, email verification, password-reset email, passkeys, multi-factor authentication, collaboration, memberships, or workspaces.
- Domain seed implementation for tasks or planner proposals.

## Required tests

- Sign-up/sign-in/sign-out and protected-route integration tests.
- Fresh-account transaction test proving Inbox and preferences are both present or both absent.
- Preference schema, IANA timezone, optimistic-conflict, and cross-user denial tests.
- Better Auth rate-limit and secure-cookie production-configuration tests.
- Demo creation/reset isolation and idempotent seed tests.
