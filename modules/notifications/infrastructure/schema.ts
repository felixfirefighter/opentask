import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

type ColumnReference = () => AnyPgColumn;

export type NotificationSchemaReferences = Readonly<{
  authUserId: ColumnReference;
  taskUserId: ColumnReference;
  taskId: ColumnReference;
}>;

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export function createNotificationSchema(references: NotificationSchemaReferences) {
  const taskReminders = pgTable(
    "task_reminders",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull(),
      taskId: uuid("task_id").notNull(),
      kind: text("kind").notNull(),
      remindAt: instant("remind_at"),
      offsetMinutes: integer("offset_minutes"),
      enabled: boolean("enabled").default(true).notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: instant("created_at").defaultNow().notNull(),
      updatedAt: instant("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "task_reminders_pkey", columns: [table.userId, table.id] }),
      unique("task_reminders_user_task_unique").on(table.userId, table.taskId),
      foreignKey({
        name: "task_reminders_user_id_user_id_fk",
        columns: [table.userId],
        foreignColumns: [references.authUserId()],
      }).onDelete("cascade"),
      foreignKey({
        name: "task_reminders_task_owner_fk",
        columns: [table.userId, table.taskId],
        foreignColumns: [references.taskUserId(), references.taskId()],
      }).onDelete("cascade"),
      check("task_reminders_kind_check", sql`${table.kind} in ('absolute', 'relative_start')`),
      check(
        "task_reminders_shape_check",
        sql`(
          ${table.kind} = 'absolute'
          and ${table.remindAt} is not null
          and ${table.offsetMinutes} is null
        ) or (
          ${table.kind} = 'relative_start'
          and ${table.remindAt} is null
          and ${table.offsetMinutes} between 0 and 10080
        )`,
      ),
      check("task_reminders_version_check", sql`${table.version} between 1 and 2147483647`),
      check("task_reminders_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
      index("task_reminders_user_enabled_idx")
        .on(table.userId, table.taskId)
        .where(sql`${table.enabled} = true`),
    ],
  );

  const pushSubscriptions = pgTable(
    "push_subscriptions",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull(),
      endpointHash: bytea("endpoint_hash").notNull(),
      endpointCiphertext: text("endpoint_ciphertext").notNull(),
      p256dhCiphertext: text("p256dh_ciphertext").notNull(),
      authCiphertext: text("auth_ciphertext").notNull(),
      encryptionKeyVersion: integer("encryption_key_version").notNull(),
      deviceLabel: text("device_label"),
      userAgentSummary: text("user_agent_summary"),
      createdAt: instant("created_at").defaultNow().notNull(),
      lastUsedAt: instant("last_used_at").defaultNow().notNull(),
      revokedAt: instant("revoked_at"),
    },
    (table) => [
      primaryKey({ name: "push_subscriptions_pkey", columns: [table.userId, table.id] }),
      foreignKey({
        name: "push_subscriptions_user_id_user_id_fk",
        columns: [table.userId],
        foreignColumns: [references.authUserId()],
      }).onDelete("cascade"),
      check("push_subscriptions_endpoint_hash_check", sql`octet_length(${table.endpointHash}) = 32`),
      check(
        "push_subscriptions_endpoint_ciphertext_check",
        ciphertextEnvelopeCheck(table.endpointCiphertext, 8192),
      ),
      check(
        "push_subscriptions_p256dh_ciphertext_check",
        ciphertextEnvelopeCheck(table.p256dhCiphertext, 1024),
      ),
      check("push_subscriptions_auth_ciphertext_check", ciphertextEnvelopeCheck(table.authCiphertext, 1024)),
      check(
        "push_subscriptions_encryption_key_version_check",
        sql`${table.encryptionKeyVersion} between 0 and 2147483647`,
      ),
      check(
        "push_subscriptions_device_label_check",
        sql`${table.deviceLabel} is null or char_length(${table.deviceLabel}) between 1 and 120`,
      ),
      check(
        "push_subscriptions_user_agent_summary_check",
        sql`${table.userAgentSummary} is null or char_length(${table.userAgentSummary}) between 1 and 500`,
      ),
      check(
        "push_subscriptions_timestamps_check",
        sql`${table.lastUsedAt} >= ${table.createdAt}
          and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.lastUsedAt})`,
      ),
      uniqueIndex("push_subscriptions_active_endpoint_hash_idx")
        .on(table.endpointHash)
        .where(sql`${table.revokedAt} is null`),
      index("push_subscriptions_user_active_idx")
        .on(table.userId, table.lastUsedAt.desc(), table.id)
        .where(sql`${table.revokedAt} is null`),
    ],
  );

  const notificationDeliveries = pgTable(
    "notification_deliveries",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull(),
      reminderId: uuid("reminder_id").notNull(),
      subscriptionId: uuid("subscription_id").notNull(),
      occurrenceKey: text("occurrence_key"),
      scheduledFor: instant("scheduled_for").notNull(),
      state: text("state").default("scheduled").notNull(),
      attemptCount: integer("attempt_count").default(0).notNull(),
      lastErrorCode: text("last_error_code"),
      deliveredAt: instant("delivered_at"),
      idempotencyKey: text("idempotency_key").notNull(),
      createdAt: instant("created_at").defaultNow().notNull(),
      updatedAt: instant("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "notification_deliveries_pkey", columns: [table.userId, table.id] }),
      foreignKey({
        name: "notification_deliveries_user_id_user_id_fk",
        columns: [table.userId],
        foreignColumns: [references.authUserId()],
      }).onDelete("cascade"),
      foreignKey({
        name: "notification_deliveries_reminder_owner_fk",
        columns: [table.userId, table.reminderId],
        foreignColumns: [taskReminders.userId, taskReminders.id],
      }).onDelete("cascade"),
      foreignKey({
        name: "notification_deliveries_subscription_owner_fk",
        columns: [table.userId, table.subscriptionId],
        foreignColumns: [pushSubscriptions.userId, pushSubscriptions.id],
      }).onDelete("no action"),
      check(
        "notification_deliveries_state_check",
        sql`${table.state} in (
          'scheduled', 'delivering', 'retry_scheduled', 'delivered', 'suppressed', 'failed'
        )`,
      ),
      check(
        "notification_deliveries_occurrence_key_check",
        sql`${table.occurrenceKey} is null or char_length(${table.occurrenceKey}) between 1 and 80`,
      ),
      check("notification_deliveries_attempt_count_check", sql`${table.attemptCount} between 0 and 4`),
      check(
        "notification_deliveries_error_code_check",
        sql`${table.lastErrorCode} is null or (
          char_length(${table.lastErrorCode}) between 1 and 80
          and ${table.lastErrorCode} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
        )`,
      ),
      check("notification_deliveries_idempotency_key_check", sql`${table.idempotencyKey} ~ '^[0-9a-f]{64}$'`),
      check("notification_deliveries_state_shape_check", deliveryStateShapeCheck(table)),
      check(
        "notification_deliveries_timestamps_check",
        sql`${table.updatedAt} >= ${table.createdAt}
          and (
            ${table.deliveredAt} is null
            or (${table.deliveredAt} >= ${table.scheduledFor} and ${table.deliveredAt} <= ${table.updatedAt})
          )`,
      ),
      uniqueIndex("notification_deliveries_idempotency_key_idx").on(table.idempotencyKey),
      index("notification_deliveries_user_state_scheduled_idx").on(
        table.userId,
        table.state,
        table.scheduledFor,
        table.id,
      ),
      index("notification_deliveries_reminder_state_scheduled_idx").on(
        table.userId,
        table.reminderId,
        table.state,
        table.scheduledFor,
        table.id,
      ),
      index("notification_deliveries_subscription_state_scheduled_idx").on(
        table.userId,
        table.subscriptionId,
        table.state,
        table.scheduledFor,
        table.id,
      ),
    ],
  );

  return { taskReminders, pushSubscriptions, notificationDeliveries } as const;
}

function ciphertextEnvelopeCheck(column: AnyPgColumn, maximumLength: 1024 | 8192) {
  const maximumLengthLiteral = maximumLength === 8192 ? sql.raw("8192") : sql.raw("1024");
  return sql`char_length(${column}) between 45 and ${maximumLengthLiteral}
    and ${column} ~ '^v1\\.[A-Za-z0-9_-]{16}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{22}$'`;
}

function deliveryStateShapeCheck(table: {
  state: AnyPgColumn;
  attemptCount: AnyPgColumn;
  lastErrorCode: AnyPgColumn;
  deliveredAt: AnyPgColumn;
}) {
  return sql`(
      ${table.state} = 'scheduled'
      and ${table.attemptCount} = 0
      and ${table.lastErrorCode} is null
      and ${table.deliveredAt} is null
    ) or (
      ${table.state} = 'delivering'
      and ${table.attemptCount} between 1 and 4
      and ${table.lastErrorCode} is null
      and ${table.deliveredAt} is null
    ) or (
      ${table.state} = 'retry_scheduled'
      and ${table.attemptCount} between 1 and 3
      and ${table.lastErrorCode} is not null
      and ${table.deliveredAt} is null
    ) or (
      ${table.state} = 'delivered'
      and ${table.attemptCount} between 1 and 4
      and ${table.lastErrorCode} is null
      and ${table.deliveredAt} is not null
    ) or (
      ${table.state} = 'suppressed'
      and ${table.attemptCount} between 0 and 4
      and ${table.lastErrorCode} is not null
      and ${table.deliveredAt} is null
    ) or (
      ${table.state} = 'failed'
      and ${table.attemptCount} between 1 and 4
      and ${table.lastErrorCode} is not null
      and ${table.deliveredAt} is null
    )`;
}
