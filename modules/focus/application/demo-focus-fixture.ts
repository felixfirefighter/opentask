import type { DemoFocusSession } from "../infrastructure/demo-focus-repository";

const ids = {
  taskFocus: "73000000-0000-4000-8000-000000000001",
  habitFocus: "73000000-0000-4000-8000-000000000002",
  break: "73000000-0000-4000-8000-000000000003",
} as const;

export function buildDemoFocusFixture(
  resetAt: Date,
  links: Readonly<{ taskId: string; habitId: string }>,
): readonly DemoFocusSession[] {
  const minute = 60_000;
  return [
    completedSession({
      id: ids.taskFocus,
      taskId: links.taskId,
      habitId: null,
      mode: "pomodoro",
      plannedSeconds: 1_500,
      accumulatedActiveSeconds: 1_500,
      startedAt: new Date(resetAt.getTime() - 55 * minute),
      endedAt: new Date(resetAt.getTime() - 25 * minute),
    }),
    completedSession({
      id: ids.habitFocus,
      taskId: null,
      habitId: links.habitId,
      mode: "stopwatch",
      plannedSeconds: null,
      accumulatedActiveSeconds: 1_200,
      startedAt: new Date(resetAt.getTime() - 48 * 60 * minute),
      endedAt: new Date(resetAt.getTime() - (48 * 60 - 20) * minute),
    }),
    {
      id: ids.break,
      taskId: null,
      habitId: null,
      kind: "break",
      mode: "pomodoro",
      state: "completed",
      startedAt: new Date(resetAt.getTime() - 19 * minute),
      pausedAt: null,
      accumulatedActiveSeconds: 300,
      plannedSeconds: 300,
      endedAt: new Date(resetAt.getTime() - 14 * minute),
      version: 1,
    },
  ];
}

function completedSession(
  input: Readonly<{
    id: string;
    taskId: string | null;
    habitId: string | null;
    mode: "pomodoro" | "stopwatch";
    plannedSeconds: number | null;
    accumulatedActiveSeconds: number;
    startedAt: Date;
    endedAt: Date;
  }>,
): DemoFocusSession {
  return {
    ...input,
    kind: "focus",
    state: "completed",
    pausedAt: null,
    version: 1,
  };
}
