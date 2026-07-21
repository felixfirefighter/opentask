import { describe, expect, it } from "vitest";

import { DEMO_FOCUS_TASK_ID } from "@/modules/tasks";

import { buildDemoNotificationFixture, DEMO_TASK_REMINDER_ID } from "./demo-notification-fixture";

describe("demo notification fixture", () => {
  it("uses the captured reset instant and includes no provider-owned state", () => {
    const resetAt = new Date("2026-07-21T08:00:00.000Z");

    const first = buildDemoNotificationFixture(resetAt);
    const second = buildDemoNotificationFixture(new Date(resetAt));

    expect(first).toEqual(second);
    expect(first).toEqual({
      resetAt,
      reminder: {
        id: DEMO_TASK_REMINDER_ID,
        taskId: DEMO_FOCUS_TASK_ID,
        kind: "absolute",
        remindAt: new Date("2026-07-21T10:00:00.000Z"),
        offsetMinutes: null,
        enabled: true,
        version: 1,
      },
    });
    expect(Object.keys(first)).toEqual(["reminder", "resetAt"]);
  });
});
