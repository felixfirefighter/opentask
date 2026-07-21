import { getTableConfig, PgDialect, pgTable, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { createNotificationSchema } from "./schema";

function createFixture() {
  const authUser = pgTable("user", { id: uuid("id").primaryKey() });
  const tasks = pgTable("tasks", {
    id: uuid("id").notNull(),
    userId: uuid("user_id").notNull(),
  });
  return createNotificationSchema({
    authUserId: () => authUser.id,
    taskUserId: () => tasks.userId,
    taskId: () => tasks.id,
  });
}

describe("notification schema contract", () => {
  it("owns the three approved tenant-leading tables", () => {
    const fixture = createFixture();
    expect([
      getTableConfig(fixture.taskReminders).name,
      getTableConfig(fixture.pushSubscriptions).name,
      getTableConfig(fixture.notificationDeliveries).name,
    ]).toEqual(["task_reminders", "push_subscriptions", "notification_deliveries"]);

    for (const table of Object.values(fixture)) {
      const config = getTableConfig(table);
      expect(config.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual(["user_id", "id"]);
    }
  });

  it("uses the canonical reminder columns, constraints, and enabled index", () => {
    const config = getTableConfig(createFixture().taskReminders);
    expect(config.columns.map(({ name }) => name)).toEqual([
      "id",
      "user_id",
      "task_id",
      "kind",
      "remind_at",
      "offset_minutes",
      "enabled",
      "version",
      "created_at",
      "updated_at",
    ]);
    expect(config.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "task_reminders_kind_check",
        "task_reminders_shape_check",
        "task_reminders_version_check",
        "task_reminders_timestamps_check",
      ]),
    );
    expect(config.uniqueConstraints.map(({ name }) => name)).toContain("task_reminders_user_task_unique");
    expect(config.indexes.map(({ config: index }) => index.name)).toContain(
      "task_reminders_user_enabled_idx",
    );
  });

  it("uses the exact protected subscription and delivery indexes", () => {
    const fixture = createFixture();
    const subscriptions = getTableConfig(fixture.pushSubscriptions);
    expect(subscriptions.columns.find(({ name }) => name === "endpoint_hash")?.getSQLType()).toBe("bytea");
    expect(subscriptions.indexes.map(({ config }) => [config.name, config.unique])).toEqual(
      expect.arrayContaining([
        ["push_subscriptions_active_endpoint_hash_idx", true],
        ["push_subscriptions_user_active_idx", false],
      ]),
    );

    const deliveries = getTableConfig(fixture.notificationDeliveries);
    expect(deliveries.indexes.map(({ config }) => [config.name, config.unique])).toEqual(
      expect.arrayContaining([
        ["notification_deliveries_idempotency_key_idx", true],
        ["notification_deliveries_user_state_scheduled_idx", false],
        ["notification_deliveries_reminder_state_scheduled_idx", false],
        ["notification_deliveries_subscription_state_scheduled_idx", false],
      ]),
    );
    expect(deliveries.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "notification_deliveries_state_check",
        "notification_deliveries_state_shape_check",
        "notification_deliveries_idempotency_key_check",
        "notification_deliveries_timestamps_check",
      ]),
    );
  });

  it("renders ciphertext bounds as migration-safe DDL literals", () => {
    const subscriptions = getTableConfig(createFixture().pushSubscriptions);
    const dialect = new PgDialect();
    const checks = subscriptions.checks
      .filter(({ name }) => name.endsWith("_ciphertext_check"))
      .map(({ value }) => dialect.sqlToQuery(value));

    expect(checks).toHaveLength(3);
    expect(checks[0]?.sql).toContain("between 45 and 8192");
    expect(checks[1]?.sql).toContain("between 45 and 1024");
    expect(checks[2]?.sql).toContain("between 45 and 1024");
    expect(checks.flatMap(({ params }) => params)).toEqual([]);
  });
});
