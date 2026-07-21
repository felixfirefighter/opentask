export const REMINDER_OFFSET_MINUTES_MIN = 0;
export const REMINDER_OFFSET_MINUTES_MAX = 10_080;
export const NOTIFICATION_ATTEMPT_MAX = 4;
export const NOTIFICATION_STALE_AFTER_SECONDS = 15 * 60;
export const NOTIFICATION_PROVIDER_TIMEOUT_MS = 10_000;
export const NOTIFICATION_RETRY_BASE_SECONDS = 30;
export const NOTIFICATION_RETRY_MAX_SECONDS = 300;
export const NOTIFICATION_DELIVERY_LEASE_SECONDS = 2 * 60;
export const NOTIFICATION_PUSH_TTL_MAX_SECONDS = 15 * 60;
export const NOTIFICATION_CLEANUP_AFTER_SECONDS = 30 * 24 * 60 * 60;
export const NOTIFICATION_QUEUE_RECOVERY_SECONDS = 31 * 24 * 60 * 60;
export const NOTIFICATION_RECOVERY_PAGE_SIZE = 100;
export const ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX = 10;

export const NOTIFICATION_ERROR_CODES = [
  "stale",
  "reminder_disabled",
  "task_deleted",
  "task_terminal",
  "occurrence_terminal",
  "schedule_changed",
  "subscription_revoked",
  "obsolete",
  "outcome_unknown",
  "provider_retryable",
  "provider_permanent",
  "subscription_gone",
  "retry_exhausted",
  "subscription_material_invalid",
] as const;

export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];
