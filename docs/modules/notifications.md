# Deferred notifications module contract

**Status:** Deferred extension. Nothing in this document is approved for implementation under the Deadline-safe Hackathon Core. It becomes active only through the scope-change protocol after the hosted friend candidate passes.

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

- If promoted, the deferred first iteration permits at most one reminder row per task and supports only `absolute` or `relative_start`.
- Absolute reminders require `remind_at`; relative reminders require `offset_minutes` and an eligible task start. Mixed fields are rejected.
- Reminder/task/subscription/delivery ownership is constrained by `user_id` in SQL.
- Relevant task/reminder changes and job creation occur in one database transaction where supported.
- Each logical delivery has a deterministic unique idempotency key. Recurring tasks schedule only the next eligible occurrence.
- Job payloads contain opaque IDs and occurrence identity, never task content, endpoints, or key material.
- The worker reloads current reminder and task state before sending. Deleted, completed, disabled, rescheduled, already delivered, or stale-version work is a no-op.
- Endpoint/key material is encrypted at rest with key-version metadata and is never returned or logged.
- Transient provider failures retry with bounded exponential backoff; permanent subscription failures revoke the subscription. Core task startup never requires push configuration.

## Dependencies

- Public authorized task/reminder snapshots and occurrence contracts from tasks.
- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- pg-boss and the Web Push provider adapter.

## Non-responsibilities

- Task schedule/recurrence ownership, an in-app notification center, multiple reminders, email/SMS/location/checklist/constant reminders, collaboration notifications, or background AI actions.
- Storing task content or push secrets in queue/delivery logs.

## Required tests

- Reminder discriminant, unique-task, ownership, optimistic-version, and relative-start eligibility tests.
- Transactional enqueue and deterministic idempotency tests, including duplicate job execution.
- Stale/deleted/completed/rescheduled/disabled task no-op tests.
- Recurring next-occurrence and DST scheduling tests.
- Transient retry, permanent-revocation, provider-unavailable, and worker-disabled degradation tests.
- Encryption round-trip plus log/export redaction tests that prove endpoint/auth/task content never leaks.
