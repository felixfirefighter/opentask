# Notifications module contract

**Status:** Active in the Local-first Full Release. P6 may implement only the one browser-push task
reminder described here; another channel, multiple reminders, or a notification center remains out
of scope.

`modules/notifications` owns reminder specifications, Web Push subscription storage, logical
delivery records, provider classification, and the two notification worker jobs. Tasks remain the
only owner of task status, schedules, recurrence, and occurrence state.

## Responsibilities

- Create, replace, enable, disable, read, or remove zero/one reminder for an owned task.
- Enroll or revoke the current browser subscription after an explicit user action.
- Reconcile the next eligible delivery after a reminder or reminder-relevant task change.
- Encrypt subscription material, enqueue atomically, deliver with bounded retries, suppress stale
  work, repair recurring chains, and delete expired operational records.
- Report browser-independent provider, encryption, and worker configuration honestly. Browser
  support, permission, and current subscription remain client-derived.

## Owned persistence

- `task_reminders`.
- `push_subscriptions`.
- `notification_deliveries`.

pg-boss owns its internal schema. Those rows are operational queue state, not notification domain
tables or portable data.

## Public use cases and contracts

Application use cases:

- `getTaskReminder(actor, taskId)`.
- `setTaskReminder(actor, input)`, including explicit enable/disable through `enabled`.
- `removeTaskReminder(actor, taskId, expectedVersion)`.
- `registerPushSubscription(actor, input)` and `revokePushSubscription(actor, endpoint)`.
- `getPushCapability(actor)`.
- `deliverNotification({schemaVersion: 1, userId, deliveryId})`.
- `runNotificationMaintenance(job)`, where `job` is the actor-scoped maintenance union below.

The strict HTTP surface is:

- `GET|PUT|DELETE /api/v1/tasks/:taskId/reminder`;
- `GET /api/v1/notifications/capability`;
- `POST /api/v1/notifications/subscriptions`;
- `POST /api/v1/notifications/subscriptions/revoke`.

Writes use JSON, exact-origin protection, an authenticated actor, and strict Zod schemas. A reminder
create supplies a client UUID and `expectedVersion: null`; replacement/enable/disable/remove supplies
the current positive version. Reminder output is:

```ts
type TaskReminderDto = {
  id: string;
  taskId: string;
  enabled: boolean;
  version: number;
  spec:
    | { kind: "absolute"; remindAt: string; offsetMinutes: null }
    | { kind: "relative_start"; remindAt: null; offsetMinutes: number };
  createdAt: string;
  updatedAt: string;
};
```

Enrollment accepts `{id, endpoint, keys: {p256dh, auth}, deviceLabel?}`. Revocation accepts the
current browser's endpoint. Endpoint/key material is valid only as inbound enrollment/revocation
data: it is encrypted or hashed immediately, is never echoed by a stored server read, and never
appears in jobs, push payloads, exports, or logs. Registration returns only
`{status:"subscribed",subscriptionId}` or `{status:"subscription_reset_required"}`; revocation
returns only `{status:"revoked"}`. The same endpoint may be active for only one account globally.
Registration reads and updates only the actor's rows. If the global active-endpoint constraint
conflicts with another account, the server returns the generic reset result without reading,
revoking, or identifying that account. The UI can then offer an explicit **Reset this browser
subscription** action: unsubscribe locally, request a fresh browser subscription, and retry
registration. A later 404/410 safely revokes the inaccessible old row for its owner.

Server capability output is exactly:

```ts
type PushCapability = {
  provider: "configured" | "unconfigured";
  storageEncryption: "configured" | "unconfigured";
  worker: "configured_unverified" | "known_disabled" | "unconfigured";
  vapidPublicKey: string | null;
};
```

The public VAPID key is intentionally returned when configured because the browser needs it for
`PushManager.subscribe()`. Private VAPID and subscription-encryption keys never leave the server.

Tasks owns and exports the transaction-aware `TaskReminderSourceReader`,
`ReminderRelevantTaskChange`, and `TaskReminderReconciler` contracts. Notifications implements the
reconciler and consumes only the task-owned authorized snapshot; tasks never imports notification
infrastructure or presentation. The task-details and Settings routes accept app-composed React slots
from `modules/notifications/presentation/index.ts`; tasks and identity do not deep-import that UI.

Infrastructure remains behind application-owned ports:

- `SubscriptionCipher` encrypts/decrypts one field with versioned AAD.
- `PushProvider` returns `accepted`, `retryable`, `subscription_gone`, `permanent`, or
  `outcome_unknown` and never exposes a raw provider error.
- `NotificationJobScheduler` ensures queues and inserts a delivery job through the caller's
  transaction.
- Repository ports require `userId` on every read/write and never accept a client ownership claim.

## Reminder eligibility and time

- One task has at most one reminder. `offsetMinutes` is an integer from `0` through `10_080`.
- `absolute` requires an enabled, open, non-deleted, non-recurring task and a `remindAt` instant
  strictly after authoritative server now. It may be scheduled or unscheduled.
- `relative_start` requires a concrete eligible start and schedules at
  `start - offsetMinutes`. The derived instant must be strictly future; missed reminders are not
  caught up.
- A timed one-off uses `task_schedules.start_at`. A timed recurrence uses the projected occurrence
  start. An all-day recurrence uses midnight at the occurrence date in the recurrence's stored IANA
  timezone. A non-recurring all-day task has no persisted intent timezone and is ineligible for a
  relative reminder; its UI offers an absolute reminder instead.
- An explicitly ended recurrence remains recurring until its retained definition and schedule are
  cleared, so it still rejects `absolute`.
- Adding recurrence while an absolute reminder exists requires an explicit conversion to a valid
  relative reminder or removal in the same reviewed flow. No command silently changes reminder
  meaning.
- A reminder specification persists unchanged when its task becomes terminal or deleted, a relative
  reminder loses its schedule, or recurrence has no future occurrence. It is dormant: no current
  delivery is eligible, but its `enabled` value is retained. Reopen, restore, reschedule, or an
  explicit recurrence restart reconciles only the next strictly future delivery; missed dormant
  instants are never caught up. Only an explicit reminder command changes `enabled` or removes it.
- Recurring tasks materialize only the next eligible delivery per active subscription. Schedule,
  recurrence, occurrence, status, delete/restore, and planner schedule writes reconcile before
  commit. Title, priority, move/rank, tag, checklist, and description changes do not.
- A task version change alone never makes a delivery stale. Reconciliation compares the persisted
  reminder specification/version and authoritative schedule, recurrence, occurrence, status, and
  deletion state.

## Delivery state and idempotency

The only states and transitions are:

```text
scheduled -> delivering -> delivered
scheduled|retry_scheduled -> delivering
delivering -> retry_scheduled
scheduled|retry_scheduled|delivering -> suppressed|failed
suppressed(reversible_eligibility, attemptCount=0) -> scheduled
```

`delivered` means the push service accepted the request, not that a browser displayed it.
`suppressed` is a recorded no-op with one sanitized code: `stale`, `reminder_disabled`,
`task_deleted`, `task_terminal`, `occurrence_terminal`, `schedule_changed`,
`subscription_revoked`, or `obsolete`. `failed` includes permanent provider failure and an unknown
remote outcome.

Each delivery targets one subscription. Its 64-character lowercase SHA-256 key is computed over a
NUL-delimited canonical string containing version marker, user ID, reminder ID, reminder version,
subscription ID, occurrence key or `none`, and `scheduledFor.toISOString()`. It contains no task
content or provider material. Reconciliation may reactivate an unattempted `suppressed` row only
when its code was the reversible `schedule_changed`, `task_deleted`, `task_terminal`, or
`occurrence_terminal` and the same deterministic instant becomes current again while still future;
its original transactionally inserted future queue job is retained for that possibility. This is
what lets restore/reopen/undo safely resume an unchanged future delivery without changing the
reminder. A row with `attemptCount > 0` or any other code is never reactivated.

Before a provider call, the worker locks and revalidates the actor-scoped delivery, changes it to
`delivering`, and increments `attemptCount` in a committed transaction. Duplicate jobs cannot claim
that row twice. An explicit HTTP 408, 429, or 5xx outcome may enter `retry_scheduled`; only those
classified responses retry. HTTP 404/410 revokes the subscription. Other explicit 4xx responses are
permanent. A timeout, connection loss, statusless result, or crash after `delivering` is an
`outcome_unknown`: it is terminal and is never sent again. Thus an ambiguous outcome is never
retried and a duplicate job cannot create an unclassified extra provider call. An explicit negative
408/429/5xx response may still produce bounded additional calls.

Frozen constants:

- stale when `now >= scheduledFor + 15 minutes`;
- provider wall-clock deadline: 10 seconds;
- four total attempts: initial plus at most three explicit retryable outcomes;
- retry delay: 30 seconds with exponential backoff capped at 300 seconds;
- abandoned `delivering` lease: 2 minutes, then maintenance records `failed/outcome_unknown`;
- push TTL: remaining seconds to the stale boundary, rounded up and capped at 900 seconds;
- terminal deliveries become cleanup-eligible after 30 days;
- revoked subscriptions become cleanup-eligible after 30 days and only after dependent deliveries
  are gone;
- both queues retain an unprocessed created/retry job for 31 days after `startAfter`; completed jobs
  are deleted after one day. A longer worker outage delays cleanup but the next actor recovery pass
  repairs it. Account/task/reminder deletion may cascade provider state earlier for privacy.

## Queues and transaction boundary

There are exactly two queues:

- `notification_delivery_v1`: expiry 60 seconds, retention 2,678,400 seconds, delete-after 86,400
  seconds, retry limit 3, retry delay 30, exponential backoff capped at 300, worker batch 1 and local
  concurrency 4.
- `notification_maintenance_v1`: expiry 120 seconds, retention 2,678,400 seconds, delete-after 86,400
  seconds, retry limit 1, retry delay 60, worker batch/concurrency 1. It has no cron or global scan.

The delivery payload is `{schemaVersion: 1, userId, deliveryId}`. The maintenance payload is the
strict union:

```ts
type NotificationMaintenanceJob =
  | { schemaVersion: 1; userId: string; kind: "delivery_lease"; deliveryId: string }
  | { schemaVersion: 1; userId: string; kind: "delivery_cleanup"; deliveryId: string }
  | { schemaVersion: 1; userId: string; kind: "subscription_cleanup"; subscriptionId: string }
  | { schemaVersion: 1; userId: string; kind: "recurring_repair"; reminderId: string }
  | {
      schemaVersion: 1;
      userId: string;
      kind: "actor_recovery";
      after: { resource: "deliveries" | "subscriptions" | "reminders"; id: string } | null;
    };
```

Every handler constrains its exact target by `userId`; no maintenance operation scans across users.
Committing `delivering` schedules that attempt's two-minute lease check. Terminal delivery,
subscription revocation, and recurring finalization transactions schedule their exact cleanup or
repair targets at the frozen times. Cleanup that still has a tenant-owned dependency safely
reschedules the same target rather than discovering another user's rows. The recovery variant scans
only its declared `userId`, in deterministic keyset pages of at most 100 rows, and self-enqueues the
next actor-scoped cursor. It repairs missing future delivery/lease/cleanup/recurring jobs and
classifies work that became stale during a long worker outage; it never sends a past-due reminder.

When worker mode is enabled, every authenticated notification capability/reminder read or write and
subscription write deduplicates an `actor_recovery` request for that actor. This recreates jobs even
after pg-boss has pruned a long-unprocessed row, without a global user scan. The operational request
must not make a manual task read/write fail when the worker/provider is disabled or unconfigured.

A Web producer ensures queue definitions before a transaction that may need a job, then uses
pg-boss's Drizzle adapter and the same transaction for `send` with the required `startAfter`. A
delivery job uses `deliveryId` as its job ID and `scheduledFor` as `startAfter`; maintenance handlers
are idempotent against the actor-scoped target state. A no-reminder task path must not require queue
initialization. If a concurrent reminder appears after the preflight read, the transaction aborts
without task changes, initializes the producer, and retries under the canonical lock order rather
than committing without reconciliation.

`pnpm worker -- --check` validates notification configuration, pg-boss schema, and both queue
definitions without registering consumers, creating cron, or sending push; it logs
`WORKER_CHECK_OK` with declared job count 2. Enabled startup registers exactly two handlers, logs
`WORKER_READY` with `registeredJobCount: 2`, handles SIGINT and SIGTERM idempotently, and allows 15
seconds for graceful completion. Compose allows 20 seconds.

## Subscription security and configuration

- Endpoint hash is the raw 32-byte SHA-256 of the exact opaque endpoint; do not normalize it.
- Endpoint, `p256dh`, and `auth` use AES-256-GCM with a random 12-byte nonce and 16-byte tag. The
  exact unpadded base64url envelope is `v1.<nonce>.<ciphertext>.<tag>`; nonce and tag are exactly 16
  and 22 characters, ciphertext is nonempty, and the key version remains in its checked column. AAD
  binds user ID, subscription ID, field name, and key version.
- Key rotation decrypts retained versions and encrypts only with the active version.
- Raw `WebPushError` values are never logged or propagated because they can contain endpoints,
  provider headers, and response bodies.

Module-owned configuration is:

```dotenv
REMINDER_WORKER_MODE=enabled|disabled
WEB_PUSH_VAPID_SUBJECT=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION=
PUSH_SUBSCRIPTION_ENCRYPTION_KEYS=
```

Absent mode means `unconfigured`; `disabled` means `known_disabled`; `enabled` means
`configured_unverified`. VAPID subject/public/private are all present or all absent, and subject is
`mailto:` or HTTPS. Encryption active version/keyring are both present or both absent. Each
comma-separated keyring entry is exactly
`<nonnegative-version>:<43-character-base64url-32-byte-key>`; versions are unique and
`PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION` must match exactly one entry. Complete absence is a supported
degradation. A nonempty malformed, duplicate-version, missing-active-version, or partial group fails
configuration validation. No secret uses `NEXT_PUBLIC_`.

## Service-worker contract

The P5 cache/fetch boundary is unchanged. A push contains only
`{schemaVersion: 1, taskId, deliveryId}` with UUIDs. Valid payloads show title `Task reminder`, body
`A task is ready for your attention.`, icon `/icons/opentask-192.png`, and deterministic tag
`opentask-${deliveryId}`. Invalid payloads show nothing. Click handling revalidates the stored data,
constructs `/tasks/${encodeURIComponent(taskId)}` from `self.location.origin`, focuses/navigates a
same-origin window when possible, or opens one. It never consumes a supplied URL or task content.

## Non-responsibilities

- Email, SMS, location, checklist, completion-relative, or constant reminders; multiple reminders;
  a notification center; collaboration notifications; background AI; or task schedule ownership.
- Provider telemetry, browser-display receipts, heartbeat/liveness tables, offline write queues, or
  exporting subscription/delivery/queue/configuration state.

## Required tests

- Reminder discriminant, eligibility, enable/disable/remove, version conflict, recurrence
  conversion/removal, exact-now/past rejection, and DST scheduling.
- Global active endpoint uniqueness, cross-user denial, generic shared-browser reset flow, encrypted
  storage, key rotation, and redaction of endpoint/key/provider errors.
- Atomic delivery/job rollback, deterministic idempotency, duplicate claim, safe suppressed-row
  reactivation, explicit retry, 404/410 revocation, permanent failure, timeout/statusless unknown,
  crash lease, stale boundary, actor-targeted recurring-chain repair/retention, greater-than-31-day
  worker-outage recovery, and query-plan fixtures.
- Provider/encryption/worker absent, malformed partial configuration, worker `--check`, exactly two
  enabled handlers, queue-definition drift, graceful signals, and provider-absent startup.
- Browser unsupported/not-requested/denied/subscribed/revoked states with no implicit permission
  prompt; generic push/click behavior and unchanged P5 cache/privacy tests.
