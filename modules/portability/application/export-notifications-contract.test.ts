import { describe, expect, it } from "vitest";

import { portableNotificationsSectionSchema } from "./export-notifications-contract";

const firstReminderId = "44444444-4444-4444-8444-444444444444";
const secondReminderId = "55555555-5555-4555-8555-555555555555";
const firstTaskId = "11111111-1111-4111-8111-111111111111";
const secondTaskId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-07-19T10:20:30.000Z";
const updatedAt = "2026-07-19T11:20:30.000Z";

describe("portable notification export contract", () => {
  it("accepts ordered absolute and relative reminder specifications", () => {
    const section = {
      schemaVersion: 1,
      reminders: [
        absoluteReminder(),
        {
          ...absoluteReminder(),
          id: secondReminderId,
          taskId: secondTaskId,
          enabled: false,
          version: 3,
          spec: { kind: "relative_start", remindAt: null, offsetMinutes: 10_080 },
        },
      ],
    } as const;

    expect(portableNotificationsSectionSchema.parse(section)).toEqual(section);
  });

  it("rejects malformed discriminants, out-of-range offsets, and nonpositive versions", () => {
    expect(
      portableNotificationsSectionSchema.safeParse({
        schemaVersion: 1,
        reminders: [
          {
            ...absoluteReminder(),
            spec: {
              kind: "absolute",
              remindAt: "2026-07-20T10:20:30.000Z",
              offsetMinutes: 15,
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      portableNotificationsSectionSchema.safeParse({
        schemaVersion: 1,
        reminders: [
          {
            ...absoluteReminder(),
            spec: { kind: "relative_start", remindAt: null, offsetMinutes: 10_081 },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      portableNotificationsSectionSchema.safeParse({
        schemaVersion: 1,
        reminders: [{ ...absoluteReminder(), version: 0 }],
      }).success,
    ).toBe(false);
  });

  it("requires deterministic ordering and valid timestamps", () => {
    expect(
      portableNotificationsSectionSchema.safeParse({
        schemaVersion: 1,
        reminders: [{ ...absoluteReminder(), id: secondReminderId }, absoluteReminder()],
      }).success,
    ).toBe(false);
    expect(
      portableNotificationsSectionSchema.safeParse({
        schemaVersion: 1,
        reminders: [absoluteReminder(), absoluteReminder()],
      }).success,
    ).toBe(false);
    expect(
      portableNotificationsSectionSchema.safeParse({
        schemaVersion: 1,
        reminders: [{ ...absoluteReminder(), updatedAt: "2026-07-19T09:20:30.000Z" }],
      }).success,
    ).toBe(false);
  });

  it("rejects provider, subscription, delivery, and queue fields", () => {
    for (const operationalField of [
      "endpoint",
      "endpointHash",
      "endpointCiphertext",
      "encryptionKeyVersion",
      "subscriptionId",
      "deliveryId",
      "idempotencyKey",
      "lastErrorCode",
      "queueName",
      "vapidPrivateKey",
    ]) {
      expect(
        portableNotificationsSectionSchema.safeParse({
          schemaVersion: 1,
          reminders: [{ ...absoluteReminder(), [operationalField]: "secret" }],
        }).success,
        operationalField,
      ).toBe(false);
    }

    for (const operationalSection of ["subscriptions", "deliveries", "jobs", "provider", "configuration"]) {
      expect(
        portableNotificationsSectionSchema.safeParse({
          schemaVersion: 1,
          reminders: [absoluteReminder()],
          [operationalSection]: [],
        }).success,
        operationalSection,
      ).toBe(false);
    }
  });
});

function absoluteReminder() {
  return {
    id: firstReminderId,
    taskId: firstTaskId,
    enabled: true,
    version: 2,
    spec: {
      kind: "absolute" as const,
      remindAt: "2026-07-20T10:20:30.000Z",
      offsetMinutes: null,
    },
    createdAt,
    updatedAt,
  };
}
