import { describe, expect, it } from "vitest";

import {
  notificationMaintenanceJobSchema,
  pushCapabilitySchema,
  registerPushSubscriptionInputSchema,
  setTaskReminderInputSchema,
  taskReminderDtoSchema,
} from "./index";

const reminderId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

describe("notification transport contracts", () => {
  it("accepts only the one-reminder discriminants and strict write shape", () => {
    expect(
      setTaskReminderInputSchema.parse({
        id: reminderId,
        taskId,
        expectedVersion: null,
        enabled: true,
        spec: { kind: "absolute", remindAt: "2026-07-22T00:00:00.000Z", offsetMinutes: null },
      }),
    ).toMatchObject({ id: reminderId, taskId, expectedVersion: null });
    expect(() =>
      setTaskReminderInputSchema.parse({
        id: reminderId,
        taskId,
        expectedVersion: null,
        enabled: true,
        spec: { kind: "relative_start", remindAt: null, offsetMinutes: 10_081 },
      }),
    ).toThrow();
    expect(() =>
      setTaskReminderInputSchema.parse({
        id: reminderId,
        taskId,
        expectedVersion: null,
        enabled: true,
        spec: { kind: "absolute", remindAt: "2026-07-22T00:00:00.000Z", offsetMinutes: null },
        secondReminder: true,
      }),
    ).toThrow();
  });

  it("never includes provider subscription material in stored reminder output", () => {
    const output = taskReminderDtoSchema.parse({
      id: reminderId,
      taskId,
      enabled: true,
      version: 1,
      spec: { kind: "relative_start", remindAt: null, offsetMinutes: 15 },
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    });
    expect(output).not.toHaveProperty("endpoint");
    expect(output).not.toHaveProperty("keys");
  });

  it("keeps enrollment inbound-only and bounded", () => {
    expect(
      registerPushSubscriptionInputSchema.parse({
        id: reminderId,
        endpoint: "https://push.example/subscription-token",
        keys: { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) },
        deviceLabel: "This browser",
      }),
    ).toMatchObject({ endpoint: "https://push.example/subscription-token" });
  });

  it("validates exact actor-targeted maintenance payloads and capability states", () => {
    expect(
      notificationMaintenanceJobSchema.parse({
        schemaVersion: 1,
        userId,
        kind: "delivery_lease",
        deliveryId: reminderId,
      }),
    ).toMatchObject({ kind: "delivery_lease" });
    expect(() =>
      notificationMaintenanceJobSchema.parse({
        schemaVersion: 1,
        kind: "delivery_cleanup",
        deliveryId: reminderId,
      }),
    ).toThrow();
    expect(
      pushCapabilitySchema.parse({
        provider: "unconfigured",
        storageEncryption: "configured",
        worker: "known_disabled",
        vapidPublicKey: null,
      }),
    ).toMatchObject({ worker: "known_disabled" });
  });
});
