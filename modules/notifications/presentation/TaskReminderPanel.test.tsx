import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { useTaskReminderController as ReminderControllerHook } from "./use-task-reminder-controller";
import { TaskReminderPanel, type TaskReminderPanelProps } from "./TaskReminderPanel";
import { NotificationApiError } from "./data/notification-api-request";

type ReminderController = ReturnType<typeof ReminderControllerHook>;

const mocks = vi.hoisted(() => ({
  controller: null as unknown as ReminderController,
}));

vi.mock("./use-task-reminder-controller", () => ({
  useTaskReminderController: () => mocks.controller,
}));
vi.mock("./TaskReminderDeliveryStatus", () => ({
  TaskReminderDeliveryStatus: () => <p>Browser delivery status</p>,
}));

beforeEach(() => {
  mocks.controller = controller();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TaskReminderPanel", () => {
  it("renders a stable loading state until reminder and task timing are authoritative", () => {
    mocks.controller = controller({ query: query({ isPending: true }) });
    render(
      <TaskReminderPanel {...props({ schedule: loadingDependency(), recurrence: loadingDependency() })} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading reminder");
    expect(screen.getByRole("region", { name: "Reminder" })).toHaveAttribute("aria-busy", "true");
  });

  it("renders an empty state and keeps its action disabled while offline", () => {
    render(<TaskReminderPanel {...props({ disabled: true })} />);

    expect(screen.getByText("No reminder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add reminder" })).toBeDisabled();
    expect(screen.getByText("Browser delivery status")).toBeInTheDocument();
  });

  it("starts an explicit reminder edit from the empty state", async () => {
    const user = userEvent.setup();
    const beginEditing = vi.fn();
    mocks.controller = controller({ beginEditing });
    render(<TaskReminderPanel {...props()} />);

    await user.click(screen.getByRole("button", { name: "Add reminder" }));
    expect(beginEditing).toHaveBeenCalledOnce();
  });

  it("keeps an already-open reminder draft read-only after connectivity is lost", () => {
    mocks.controller = controller({
      editing: true,
      draft: { kind: "absolute", absoluteLocal: "2099-07-21T09:30", offsetMinutes: "15", enabled: true },
      interpretation: {
        valid: true,
        spec: { kind: "absolute", remindAt: "2099-07-21T01:30:00Z", offsetMinutes: null },
        summary: "At a future time",
      },
    });
    render(<TaskReminderPanel {...props({ disabled: true })} />);

    expect(screen.getByLabelText("Reminder date and time")).toBeDisabled();
    expect(screen.getByLabelText("Enable this reminder after saving")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save reminder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("does not expose ownership failures as retryable detail", () => {
    const error = new NotificationApiError({ code: "FORBIDDEN", status: 403, detail: "forbidden" });
    mocks.controller = controller({ query: query({ data: undefined, isError: true, error }) });
    render(<TaskReminderPanel {...props()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Reminder unavailable");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("preserves the draft and requires an explicit authoritative reload after conflict", async () => {
    const user = userEvent.setup();
    const reloadLatest = vi.fn(async () => undefined);
    mocks.controller = controller({
      editing: true,
      conflict: true,
      draft: { kind: "absolute", absoluteLocal: "2099-07-21T09:30", offsetMinutes: "15", enabled: true },
      error: new NotificationApiError({ code: "CONFLICT", status: 409, detail: "changed" }),
      interpretation: {
        valid: true,
        spec: { kind: "absolute", remindAt: "2099-07-21T01:30:00Z", offsetMinutes: null },
        summary: "At a future time",
      },
      reloadLatest,
    });
    render(<TaskReminderPanel {...props()} />);

    expect(screen.getByLabelText("Reminder date and time")).toHaveValue("2099-07-21T09:30");
    await user.click(screen.getByRole("button", { name: "Load latest reminder" }));
    expect(reloadLatest).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Reminder date and time")).toHaveValue("2099-07-21T09:30");
  });

  it("reports a transport-unknown change truthfully and offers authoritative recovery", async () => {
    const user = userEvent.setup();
    const reloadLatest = vi.fn(async () => undefined);
    const reminder = absoluteReminder();
    mocks.controller = controller({
      error: new TypeError("response lost"),
      query: query({ data: reminder }),
      reminder,
      reloadLatest,
    });
    render(<TaskReminderPanel {...props()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("change could not be confirmed");
    expect(screen.queryByText(/previous reminder is unchanged/iu)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check saved reminder" }));
    expect(reloadLatest).toHaveBeenCalledOnce();
  });

  it("shows retained reminder dormancy without changing its enabled value", () => {
    const reminder = absoluteReminder();
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(<TaskReminderPanel {...props({ task: { ...props().task, status: "completed" as const } })} />);

    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByText(/saved reminder will resume only after reopening/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit reminder" })).toBeDisabled();
  });

  it("does not offer to re-enable a dormant reminder while its task is terminal", () => {
    const reminder = { ...absoluteReminder(), enabled: false };
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(<TaskReminderPanel {...props({ task: { ...props().task, status: "completed" as const } })} />);

    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit reminder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove…" })).toBeEnabled();
  });

  it("shows an exhausted recurring reminder as dormant while retaining its enabled choice", () => {
    const reminder = relativeReminder();
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(<TaskReminderPanel {...props({ recurrence: readyDependency("exhausted") })} />);

    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByText(/recurrence has no future occurrence/iu)).toBeInTheDocument();
    expect(screen.getByText(/missed reminders will not be caught up/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable" })).toBeEnabled();
  });

  it("shows an ended recurring reminder as dormant until the series restarts", () => {
    const reminder = relativeReminder();
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(<TaskReminderPanel {...props({ recurrence: readyDependency("ended") })} />);

    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByText(/recurrence has ended/iu)).toBeInTheDocument();
    expect(screen.getByText(/missed reminders will not be caught up/iu)).toBeInTheDocument();
  });

  it("shows a relative reminder whose derived reminder instant has passed as dormant", () => {
    const reminder = relativeReminder();
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(
      <TaskReminderPanel
        {...props({
          schedule: readyDependency({ kind: "timed", startAt: "2000-01-01T00:00:00.000Z" }),
        })}
      />,
    );

    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByText(/reminder time has passed/iu)).toBeInTheDocument();
    expect(screen.getByText(/missed reminder will not be caught up/iu)).toBeInTheDocument();
  });

  it("changes a relative reminder to dormant at its offset reminder instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2099-07-21T01:30:00.000Z");
    const reminder = relativeReminder();
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(
      <TaskReminderPanel
        {...props({
          schedule: readyDependency({ kind: "timed", startAt: "2099-07-21T01:46:00.000Z" }),
        })}
      />,
    );

    expect(screen.getByText("Enabled")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_001));
    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByText(/reminder time has passed/iu)).toBeInTheDocument();
  });

  it("treats the exact relative reminder instant as passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2099-07-21T01:30:00.000Z");
    const reminder = relativeReminder();
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(
      <TaskReminderPanel
        {...props({
          schedule: readyDependency({ kind: "timed", startAt: "2099-07-21T01:45:00.000Z" }),
        })}
      />,
    );

    expect(screen.getByText("Dormant")).toBeInTheDocument();
  });

  it("changes a zero-offset relative reminder at the scheduled start", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2099-07-21T01:30:00.000Z");
    const reminder = relativeReminder(0);
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(
      <TaskReminderPanel
        {...props({
          schedule: readyDependency({ kind: "timed", startAt: "2099-07-21T01:30:00.001Z" }),
        })}
      />,
    );

    expect(screen.getByText("Enabled")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Dormant")).toBeInTheDocument();
  });

  it("changes an absolute reminder to dormant at its reminder instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2099-07-21T01:30:00.000Z");
    const reminder = absoluteReminder("2099-07-21T01:30:00.001Z");
    mocks.controller = controller({ query: query({ data: reminder }), reminder });
    render(<TaskReminderPanel {...props()} />);

    expect(screen.getByText("Enabled")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByText(/choose a future time/iu)).toBeInTheDocument();
  });

  it("surfaces a dependent timing failure before loading and retries both dependencies", async () => {
    const user = userEvent.setup();
    const scheduleRetry = vi.fn();
    const recurrenceRetry = vi.fn();
    mocks.controller = controller({ query: query({ isPending: true }) });
    render(
      <TaskReminderPanel
        {...props({
          schedule: errorDependency(scheduleRetry),
          recurrence: loadingDependency(recurrenceRetry),
        })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Reminder timing could not be loaded");
    expect(screen.queryByText("Loading reminder…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(scheduleRetry).toHaveBeenCalledOnce();
    expect(recurrenceRetry).toHaveBeenCalledOnce();
  });

  it("names an offline dependent failure without offering a doomed retry", () => {
    render(
      <TaskReminderPanel
        {...props({ disabled: true, schedule: errorDependency(), recurrence: loadingDependency() })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reminder timing is unavailable while offline. Reconnect to load it.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps cached timing visible after a refresh failure and offers recovery", async () => {
    const user = userEvent.setup();
    const scheduleRetry = vi.fn();
    const recurrenceRetry = vi.fn();
    render(
      <TaskReminderPanel
        {...props({
          schedule: readyDependency(null, { stale: true, retry: scheduleRetry }),
          recurrence: readyDependency("none", { stale: true, retry: recurrenceRetry }),
        })}
      />,
    );

    expect(screen.getByText("No reminder")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing the last loaded reminder timing. A fresh copy could not be loaded.",
    );
    await user.click(screen.getByRole("button", { name: "Refresh reminder timing" }));
    expect(scheduleRetry).toHaveBeenCalledOnce();
    expect(recurrenceRetry).toHaveBeenCalledOnce();
  });
});

function props(overrides: Partial<TaskReminderPanelProps> = {}): TaskReminderPanelProps {
  return {
    task: {
      id: "3eeaf737-ce15-4a6e-b295-a8646f50e8a5",
      status: "open",
      deleted: false,
      parentTaskId: null,
    },
    schedule: readyDependency(null),
    recurrence: readyDependency("none"),
    timeZone: "Asia/Singapore",
    disabled: false,
    ...overrides,
  };
}

function controller(overrides: Partial<ReminderController> = {}): ReminderController {
  return {
    allowedKinds: ["absolute"],
    confirmingRemove: false,
    conflict: false,
    latestReloaded: false,
    draft: null,
    editing: false,
    error: null,
    interpretation: null,
    pending: false,
    query: query(),
    reminder: null,
    beginEditing: vi.fn(),
    cancelEditing: vi.fn(),
    remove: vi.fn(async () => undefined),
    reloadLatest: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    setConfirmingRemove: vi.fn(),
    setDraft: vi.fn(),
    setEnabled: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as ReminderController;
}

function query(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    data: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as ReminderController["query"];
}

function absoluteReminder(remindAt = "2099-07-21T01:30:00Z") {
  return {
    id: "515f0f06-7d72-44b5-b27b-38ca77ea91ac",
    taskId: props().task.id,
    enabled: true,
    version: 1,
    spec: { kind: "absolute" as const, remindAt, offsetMinutes: null },
    createdAt: "2099-07-20T00:00:00Z",
    updatedAt: "2099-07-20T00:00:00Z",
  };
}

function relativeReminder(offsetMinutes = 15) {
  return {
    ...absoluteReminder(),
    spec: { kind: "relative_start" as const, remindAt: null, offsetMinutes },
  };
}

function readyDependency<T>(value: T, overrides: Readonly<{ stale?: boolean; retry?: () => void }> = {}) {
  return {
    status: "ready" as const,
    value,
    stale: overrides.stale ?? false,
    retry: overrides.retry ?? vi.fn(),
  };
}

function loadingDependency(retry: () => void = vi.fn()) {
  return { status: "loading" as const, retry };
}

function errorDependency(retry: () => void = vi.fn(), permissionSafe = false) {
  return { status: "error" as const, permissionSafe, retry };
}
