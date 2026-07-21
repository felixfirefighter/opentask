import { DEMO_FOCUS_TASK_ID } from "@/modules/tasks";

import type { DemoNotificationFixture } from "../infrastructure/demo-notification-repository";

export const DEMO_TASK_REMINDER_ID = "74000000-0000-4000-8000-000000000001";

export function buildDemoNotificationFixture(resetAt: Date): DemoNotificationFixture {
  const capturedResetAt = new Date(resetAt);
  return {
    reminder: {
      id: DEMO_TASK_REMINDER_ID,
      taskId: DEMO_FOCUS_TASK_ID,
      kind: "absolute",
      remindAt: new Date(capturedResetAt.getTime() + 2 * 60 * 60 * 1_000),
      offsetMinutes: null,
      enabled: true,
      version: 1,
    },
    resetAt: capturedResetAt,
  };
}
