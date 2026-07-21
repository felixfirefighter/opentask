# Operational security and privacy

This guide covers deployment-time trust and privacy boundaries for the Local-first Full Release.
Use the root [security policy](../SECURITY.md) for private vulnerability reporting and supported
versions. Product and data authority remain in [SCOPE.md](SCOPE.md),
[ARCHITECTURE.md](ARCHITECTURE.md), and the owning module contracts.

## Operator trust boundary

- Keep `.env.local`, database credentials, `BETTER_AUTH_SECRET`, `OPENAI_API_KEY`, the VAPID private
  key, and subscription-encryption keys outside Git, logs, screenshots, browser bundles, and support
  artifacts. The VAPID public key alone is intentionally browser-visible.
- Set `BETTER_AUTH_URL` to the exact HTTPS browser origin. The only alternate-origin rule is the
  documented same-scheme, same-port `localhost`/`127.0.0.1` pair for local development; production
  has no wildcard or second-origin trust.
- Put a network-accessible deployment behind one ingress that overwrites `X-Real-IP`, and block
  direct access to the application origin. OpenTask intentionally does not trust
  `X-Forwarded-For` for abuse-control identity.
- Use TLS outside loopback, a private PostgreSQL connection, a non-development database password,
  provider least privilege, and encrypted operator backups. A self-host operator and anyone with
  database or process access remain inside the application trust boundary and can access task data.

The exact optional push variables, generation commands, all-or-none validation, and rotation shape
are maintained in [DEPLOYMENT.md](DEPLOYMENT.md#optional-browser-push-variables). Complete provider
absence is supported degradation; partial or malformed secret groups are configuration errors.

## Authentication and request boundaries

- Better Auth owns credential and session mechanics. Application use cases re-authorize every
  identifier by the authenticated user or explicit ownership; a client-supplied user or ownership
  field is never authoritative.
- JSON mutations validate bounded input, require the exact trusted origin, and recheck domain
  invariants inside the application transaction. Errors use stable codes and correlation IDs
  without revealing another account, SQL details, or provider responses.
- Authenticated routes and exports remain dynamic and database-authoritative. Do not place a CDN or
  shared response cache in front of them unless a future reviewed design adds an explicit private
  cache policy.

## Browser-push privacy boundary

The notification module owns one reminder per task, encrypted browser subscriptions, logical
delivery records, and two pg-boss queues. Its detailed state and retry invariants live in
[modules/notifications.md](modules/notifications.md).

- Subscription endpoint, `p256dh`, and `auth` values are encrypted independently with AES-256-GCM,
  a random nonce, versioned associated data, and the active 32-byte key. The exact endpoint also has
  a raw SHA-256 lookup hash. Encryption protects these provider credentials at rest; it does not
  make a compromised application process or keyring safe.
- Each account is limited to 10 active browser subscriptions. New-endpoint admission is serialized
  by an actor-scoped transaction advisory lock; refreshing the same endpoint remains possible at
  the cap, and revocation frees a slot. This bounds per-reminder provider fan-out without exposing
  another account's endpoint ownership.
- Durable delivery jobs contain only opaque `schemaVersion`, `userId`, and `deliveryId` values.
  Maintenance jobs are also actor-scoped opaque identifiers. Neither job type contains a title,
  description, schedule text, endpoint, browser key, ciphertext, hash, provider body, or URL.
- The provider payload is exactly `{schemaVersion: 1, taskId, deliveryId}`. The service worker
  constructs the same-origin task route itself and displays the generic title **Task reminder** and
  body **A task is ready for your attention.** It ignores malformed payloads and never accepts
  provider-supplied display copy or navigation URLs.
- Push endpoints are limited to HTTPS services whose resolved addresses are publicly routable. The
  provider adapter rechecks resolution during connection, rejects redirects, and does not expose
  raw Web Push errors, headers, endpoints, or response bodies.
- Delivery state is committed before the remote call. Only an explicit retryable provider response
  can retry; a timeout, lost connection, statusless result, or crash with an ambiguous outcome is
  terminal and is not resent.

`REMINDER_WORKER_MODE=enabled` reports configured-but-unverified capability; it is not proof that a
worker is alive. Operators must supervise the process, run the non-consuming two-queue check, verify
the readiness event, and allow the documented clean shutdown window. See
[DEPLOYMENT.md](DEPLOYMENT.md#worker-readiness-and-shutdown).

## Logging and external providers

- Structured logs may contain route/use-case names, timing, status class, correlation IDs, and
  useful opaque entity IDs. They must not contain emails, task or habit content, planner input or
  output, request bodies, cookies, authorization headers, sessions, OpenAI/VAPID/encryption keys,
  subscription endpoint/auth/ciphertext/hash material, job payloads, or raw provider data.
- OpenAI is server-only and optional. Planner requests send only selected planning context, set
  `store: false`, validate Structured Output, persist a proposal, and cannot write before explicit
  user review and Apply.
- Web Push is server-only apart from the intentionally public VAPID key. Provider absence never
  blocks manual task, planning, habit, Focus, export, or local startup paths.

## PWA and export boundaries

- The service worker caches only the content-free offline document, original public icons, and
  fingerprinted public/static application assets. It does not cache authenticated HTML, API
  responses, exports, task/planner data, or provider responses, and it never queues a domain write.
- Already rendered data may remain visible and read-only during disconnection. A cold offline
  navigation reveals no account or task data. Offline mutation synchronization is outside this
  release.
- The authenticated export envelope is schema version 5 with notifications section version 1. It
  contains user-authored product data and portable reminder specifications, so treat the downloaded
  file as sensitive. It excludes push subscriptions, endpoint/key/ciphertext/hash material,
  delivery records, pg-boss internals, provider configuration, credentials, active Focus state, and
  break rows, plus raw planner input; portable proposal records contain only schema-validated output.
  The service worker must never cache it.

## Release checks

Before exposing a release candidate:

```sh
pnpm check:secrets
pnpm check:audit
pnpm check:licenses
pnpm worker -- --check
pnpm test:production
```

Run `pnpm test:production` only after starting the isolated production Compose topology described in
[SETUP.md](SETUP.md#full-docker-path); the command audits an already-running topology and then sends
its shutdown signals.

The canonical `pnpm verify` gate includes repository-file secret scanning, dependency/license
checks, authorization and privacy suites, production build, and provider-degraded coverage. Review
logs, exported JSON, Cache Storage, screenshots, and video separately with synthetic accounts; no
automated scan makes those disclosure surfaces safe by itself.
