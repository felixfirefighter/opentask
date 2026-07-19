# Notifications module contract

**Status:** Active in the Local-first Full Release. Implementation begins only in P6 after recurrence
and the service-worker contract freeze; this contract does not authorize another channel or a
notification center.

`modules/notifications` owns the single supported browser-push reminder, push subscriptions, delivery records, and pg-boss worker behavior.

## Responsibilities

- Create, update, enable, disable, or remove zero/one reminder for an owned task.
- Manage encrypted Web Push subscriptions and capability/permission state.
- Reconcile reminder delivery when a task schedule, recurrence, status, or deletion state changes.
- Enqueue, deliver, retry, no-op stale jobs, and clean retained delivery records.
- Expose clear unavailable/degraded state when browser permission, VAPID configuration, or worker service is absent.

## Owned persistence

- `task_reminders`.
- `push_subscriptions`.
- `notification_deliveries`.

pg-boss owns its internal queue schema; those tables are not domain tables.

## Public use cases and contracts

- `setTaskReminder`, `removeTaskReminder`, and `getTaskReminder`.
- `registerPushSubscription`, `revokePushSubscription`, and `getPushCapability`.
- `reconcileTaskReminder(transaction, taskChange)` is the narrow service injected into task mutations.
- Worker use cases: `deliverNotification(deliveryId)`, `scheduleNextRecurringDelivery`, and `cleanupNotificationRecords`.
- Public contracts: `TaskReminderDto`, `ReminderSpec`, `PushCapability`, `TaskReminderChange`, and `ReminderReconciler`.

## Invariants

- The active release permits at most one reminder row per task and supports only `absolute` or
  `relative_start`.
- Absolute reminders require `remind_at` and a non-recurring task. Relative reminders require
  `offset_minutes` and an eligible task start. A recurring task accepts only `relative_start`; mixed
  fields and an absolute recurring reminder are rejected with explicit copy.
- A relative reminder is accepted only when the tasks snapshot can resolve a concrete next start
  instant. For recurring tasks it is evaluated per occurrence and only the next eligible logical
  delivery is materialized.
- Reminder/task/subscription/delivery ownership is constrained by `user_id` in SQL.
- Relevant task/reminder changes, logical delivery reconciliation, and pg-boss job creation occur in
  one PostgreSQL transaction; a partially committed reminder/job pair is forbidden.
- Each logical delivery targets one owned active subscription and has a deterministic unique
  idempotency key derived from opaque reminder, subscription, and optional occurrence identities,
  without task content or subscription secrets. Recurring tasks schedule only the next eligible
  occurrence per active subscription.
- Job payloads contain opaque IDs and occurrence identity, never task content, endpoints, or key material.
- The worker reloads current reminder, task, occurrence, and subscription state before sending.
  Deleted, completed/skipped, disabled, rescheduled, already delivered, revoked, or stale work is a
  recorded no-op.
- Endpoint/key material is encrypted at rest with key-version metadata and is never returned or logged.
- Transient provider failures retry with bounded exponential backoff; permanent subscription failures revoke the subscription. Core task startup never requires push configuration.
- Push enrollment begins only from an explicit user action. Denied permission, unsupported browser,
  missing VAPID/provider configuration, missing encryption key, or known-disabled worker
  configuration produces an honest degraded state and never blocks task/manual startup. No heartbeat
  table is added: when configuration expects a worker, capability copy explicitly says runtime
  liveness is not verified. Operators use the worker check and readiness log to detect unexpected
  process death.

## Dependencies

- Public authorized task/reminder snapshots and occurrence contracts from tasks.
- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- pg-boss and the Web Push provider adapter behind application-owned ports.

## Non-responsibilities

- Task schedule/recurrence ownership, an in-app notification center, multiple reminders, email/SMS/location/checklist/constant reminders, collaboration notifications, or background AI actions.
- Storing task content or push secrets in queue/delivery logs.

## Required tests

- Reminder discriminant, unique-task, ownership, optimistic-version, and relative-start eligibility tests.
- Browser capability/permission and provider/worker-degraded-state tests with no implicit permission
  prompt.
- Transactional enqueue and deterministic idempotency tests, including duplicate job execution.
- Stale/deleted/completed/rescheduled/disabled task no-op tests.
- Recurring next-occurrence and DST scheduling tests.
- Transient retry, permanent-revocation, provider-unavailable, and worker-disabled degradation tests.
- Encryption round-trip plus log/export redaction tests that prove endpoint/auth/task content never leaks.
