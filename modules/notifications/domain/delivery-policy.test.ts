import { describe, expect, it } from "vitest";

import {
  canReactivateSuppressedDelivery,
  isNotificationStale,
  notificationPushTtlSeconds,
  notificationRetryDelaySeconds,
} from "./delivery-policy";

describe("notification delivery policy", () => {
  const scheduledFor = new Date("2026-07-21T00:00:00.000Z");

  it("uses the exact inclusive fifteen-minute stale boundary", () => {
    expect(isNotificationStale(scheduledFor, new Date("2026-07-21T00:14:59.999Z"))).toBe(false);
    expect(isNotificationStale(scheduledFor, new Date("2026-07-21T00:15:00.000Z"))).toBe(true);
  });

  it("rounds TTL up and caps it at nine hundred seconds", () => {
    expect(notificationPushTtlSeconds(scheduledFor, new Date("2026-07-20T23:59:59.500Z"))).toBe(900);
    expect(notificationPushTtlSeconds(scheduledFor, new Date("2026-07-21T00:14:59.001Z"))).toBe(1);
    expect(notificationPushTtlSeconds(scheduledFor, new Date("2026-07-21T00:15:00.000Z"))).toBe(0);
  });

  it("bounds explicit retry delays and total attempts", () => {
    expect([1, 2, 3].map(notificationRetryDelaySeconds)).toEqual([30, 60, 120]);
    expect(() => notificationRetryDelaySeconds(4)).toThrow(/below the final attempt/);
  });

  it("reactivates only unattempted reversible future suppressions", () => {
    const input = {
      state: "suppressed" as const,
      attemptCount: 0,
      errorCode: "schedule_changed",
      scheduledFor: new Date("2026-07-22T00:00:00.000Z"),
      now: scheduledFor,
    };
    expect(canReactivateSuppressedDelivery(input)).toBe(true);
    expect(canReactivateSuppressedDelivery({ ...input, attemptCount: 1 })).toBe(false);
    expect(canReactivateSuppressedDelivery({ ...input, errorCode: "stale" })).toBe(false);
  });
});
