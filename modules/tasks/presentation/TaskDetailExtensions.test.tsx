import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskApiError } from "./data/task-api-request";

const queries = vi.hoisted(() => ({
  recurrence: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("./data/use-task-recurrence", () => ({
  useTaskRecurrenceQuery: queries.recurrence,
}));
vi.mock("./data/use-task-schedule", () => ({
  useTaskScheduleQuery: queries.schedule,
}));

import {
  TaskDetailExtensionsProvider,
  TaskReminderExtension,
  type TaskReminderExtensionProps,
} from "./TaskDetailExtensions";

beforeEach(() => {
  vi.clearAllMocks();
  queries.schedule.mockReturnValue(readyQuery(null));
  queries.recurrence.mockReturnValue(readyQuery(null));
});

describe("Task reminder detail extension", () => {
  it("preserves recurrence lifecycle and timing needed for honest dormancy", () => {
    queries.schedule.mockReturnValue(readyQuery({ kind: "timed", startAt: "2000-01-01T00:00:00.000Z" }));
    queries.recurrence.mockReturnValue(readyQuery({ lifecycle: "exhausted" }));

    const reminder = renderExtension();

    expect(reminder).toHaveBeenCalled();
    expect(latestProps(reminder).schedule).toMatchObject({
      status: "ready",
      value: { kind: "timed", startAt: "2000-01-01T00:00:00.000Z" },
      stale: false,
    });
    expect(latestProps(reminder).recurrence).toMatchObject({
      status: "ready",
      value: "exhausted",
      stale: false,
    });
  });

  it("distinguishes an initial permission-safe dependency failure from loading and keeps retry", () => {
    const scheduleRetry = vi.fn(async () => undefined);
    const recurrenceRetry = vi.fn(async () => undefined);
    queries.schedule.mockReturnValue({
      data: undefined,
      isError: true,
      error: new TaskApiError({ code: "NOT_FOUND", status: 404, detail: "missing" }),
      refetch: scheduleRetry,
    });
    queries.recurrence.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: true,
      error: null,
      refetch: recurrenceRetry,
    });

    const reminder = renderExtension();
    const passed = latestProps(reminder);

    expect(passed.schedule).toMatchObject({ status: "error", permissionSafe: true });
    expect(passed.recurrence).toMatchObject({ status: "loading" });
    passed.schedule.retry();
    passed.recurrence.retry();
    expect(scheduleRetry).toHaveBeenCalledOnce();
    expect(recurrenceRetry).toHaveBeenCalledOnce();
  });

  it("keeps cached timing readable and marks a failed refresh as stale", () => {
    queries.schedule.mockReturnValue({
      ...readyQuery({ kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" }),
      isError: true,
      error: new Error("offline"),
    });
    queries.recurrence.mockReturnValue({
      ...readyQuery({ lifecycle: "active" }),
      isError: true,
      error: new Error("offline"),
    });

    const reminder = renderExtension();

    expect(latestProps(reminder).schedule).toMatchObject({
      status: "ready",
      value: { kind: "all_day", startAt: null },
      stale: true,
    });
    expect(latestProps(reminder).recurrence).toMatchObject({
      status: "ready",
      value: "active",
      stale: true,
    });
  });

  it("does not query recurrence semantics for a subtask", () => {
    const reminder = renderExtension({ parentTaskId: "00000000-0000-4000-8000-000000000099" });

    expect(queries.recurrence).toHaveBeenCalledWith("3eeaf737-ce15-4a6e-b295-a8646f50e8a5", false);
    expect(latestProps(reminder).recurrence).toMatchObject({ status: "ready", value: "none" });
  });
});

function renderExtension(taskOverrides: Readonly<{ parentTaskId?: string | null }> = {}) {
  const reminder = vi.fn((props: TaskReminderExtensionProps) => (
    <p data-disabled={String(props.disabled)}>Reminder extension</p>
  ));
  const RecurrenceSource = () => null;
  render(
    <TaskDetailExtensionsProvider reminder={reminder} recurrenceReminderSource={RecurrenceSource}>
      <TaskReminderExtension
        task={{
          id: "3eeaf737-ce15-4a6e-b295-a8646f50e8a5",
          status: "open",
          deleted: false,
          parentTaskId: taskOverrides.parentTaskId ?? null,
        }}
        timeZone="Asia/Singapore"
        disabled={false}
      />
    </TaskDetailExtensionsProvider>,
  );
  expect(screen.getByText("Reminder extension")).toBeInTheDocument();
  return reminder;
}

function latestProps(reminder: ReturnType<typeof renderExtension>): TaskReminderExtensionProps {
  const props = reminder.mock.lastCall?.[0];
  if (!props) throw new Error("Reminder extension did not receive props.");
  return props;
}

function readyQuery(data: unknown) {
  return {
    data,
    isError: false,
    isPending: false,
    error: null,
    refetch: vi.fn(async () => undefined),
  };
}
