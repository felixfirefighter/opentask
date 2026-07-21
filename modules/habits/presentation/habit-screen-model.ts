import type { HabitDayProjection, HabitOverview, HabitTodayRow } from "../application/contracts";

export type HabitLifecycleView = "active" | "archived";

export type HabitScreenCondition =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "loading"; message?: string }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "offline" }>
  | Readonly<{ kind: "permission" }>
  | Readonly<{
      kind: "conflict";
      message: string;
      currentVersion?: number;
    }>;

export type HabitWriteFeedback = Readonly<{
  kind: "error" | "conflict" | "success";
  message: string;
}> | null;

export type HabitSummaryModel = HabitOverview;
export type HabitTodayModel = HabitTodayRow;
export type HabitHistoryDayModel = HabitDayProjection;

export function habitWriteDisabledReason(condition: HabitScreenCondition): string | undefined {
  switch (condition.kind) {
    case "offline":
      return "Reconnect to change this habit.";
    case "conflict":
      return "Review the latest habit before making changes.";
    case "error":
      return "Refresh habits before making changes.";
    case "loading":
      return "Wait for habits to finish loading before making changes.";
    case "permission":
      return "This habit is read-only because access is unavailable.";
    case "ready":
      return undefined;
  }
}
