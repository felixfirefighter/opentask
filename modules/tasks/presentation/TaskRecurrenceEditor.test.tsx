import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto, TaskScheduleDto } from "../application/contracts";
import type { TaskRecurrenceDto } from "../application/contracts/recurrence-contract";
import { TaskApiError } from "./data/task-api-request";
import { clearTaskDrafts } from "./task-draft-guard";

const scheduleApi = vi.hoisted(() => ({
  getSchedulePreferences: vi.fn(),
  getTaskSchedule: vi.fn(),
}));
const recurrenceApi = vi.hoisted(() => ({
  editRecurringTaskSchedule: vi.fn(),
  endTaskRecurrence: vi.fn(),
  getTaskRecurrence: vi.fn(),
  setTaskRecurrence: vi.fn(),
}));
const taskApi = vi.hoisted(() => ({ getTask: vi.fn() }));

vi.mock("./data/task-schedule-api-client", () => scheduleApi);
vi.mock("./data/task-recurrence-api-client", () => recurrenceApi);
vi.mock("./data/task-api-client", () => ({ getTask: taskApi.getTask }));

import { TaskRecurrenceEditor } from "./TaskRecurrenceEditor";

const TASK_ID = "00000000-0000-4000-8000-000000000010";
const LIST_ID = "00000000-0000-4000-8000-000000000020";
let savedRecurrence: TaskRecurrenceDto | null;
let savedSchedule: TaskScheduleDto | null;
let savedTaskVersion: number;

beforeEach(() => {
  vi.clearAllMocks();
  clearTaskDrafts(TASK_ID);
  savedRecurrence = null;
  savedSchedule = allDaySchedule();
  savedTaskVersion = 1;
  scheduleApi.getSchedulePreferences.mockResolvedValue({
    timeZone: "Asia/Singapore",
    hourCycle: "h23",
  });
  scheduleApi.getTaskSchedule.mockImplementation(async () => savedSchedule);
  recurrenceApi.getTaskRecurrence.mockImplementation(async () => savedRecurrence);
  recurrenceApi.setTaskRecurrence.mockImplementation(async (taskId, input) => {
    savedTaskVersion = input.expectedVersion + 1;
    savedRecurrence = recurrence({
      definition: input.definition,
      lifecycle: "active",
      taskVersion: savedTaskVersion,
    });
    return {
      task: { id: taskId, version: savedTaskVersion },
      recurrence: savedRecurrence,
    };
  });
  recurrenceApi.endTaskRecurrence.mockImplementation(async (taskId, input) => {
    savedTaskVersion = input.expectedVersion + 1;
    savedRecurrence = recurrence({ lifecycle: "ended", taskVersion: savedTaskVersion });
    return {
      task: { id: taskId, version: savedTaskVersion },
      recurrence: savedRecurrence,
    };
  });
  taskApi.getTask.mockImplementation(async () => taskDetail({ version: savedTaskVersion }));
});

describe("TaskRecurrenceEditor", () => {
  it("creates a bounded selected-weekday series from an interpreted form", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Add recurrence" }));
    await user.selectOptions(screen.getByLabelText("Cadence"), "weekly");
    await user.click(screen.getByRole("checkbox", { name: "Wednesday" }));
    await user.selectOptions(screen.getByLabelText("Ends"), "count");
    fireEvent.change(screen.getByLabelText("Occurrences"), { target: { value: "5" } });

    expect(screen.getByText(/Interpreted as: Every week on Monday and Wednesday/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add recurrence" }));

    await waitFor(() =>
      expect(recurrenceApi.setTaskRecurrence).toHaveBeenCalledWith(TASK_ID, {
        expectedVersion: 1,
        definition: {
          preset: { kind: "weekly", interval: 1, weekdays: [1, 3] },
          end: { kind: "count", count: 5 },
        },
      }),
    );
    expect(await screen.findByText("Recurrence added")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    await waitFor(() => expect(scheduleApi.getTaskSchedule).toHaveBeenCalledTimes(2));
  });

  it("confirms a future restart and keeps recorded-history language visible", async () => {
    savedRecurrence = recurrence();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Edit recurrence" }));
    fireEvent.change(screen.getByLabelText("Repeat every"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Save and restart" }));

    const dialog = screen.getByRole("alertdialog", { name: "Restart future recurrence?" });
    expect(within(dialog).getByText(/Recorded occurrence history is kept/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Keep current series" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Restart future recurrence" }));

    await waitFor(() =>
      expect(recurrenceApi.setTaskRecurrence).toHaveBeenCalledWith(
        TASK_ID,
        expect.objectContaining({
          expectedVersion: 1,
          definition: expect.objectContaining({ preset: { kind: "daily", interval: 2 } }),
        }),
      ),
    );
    expect(await screen.findByText("Future recurrence restarted")).toBeInTheDocument();
  });

  it("confirms ending future expansion without removing its definition", async () => {
    savedRecurrence = recurrence();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "End recurrence…" }));
    const dialog = screen.getByRole("alertdialog", { name: "End future recurrence?" });
    expect(
      within(dialog).getByText(/saved definition and recorded occurrence history remain/i),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "End future recurrence" }));

    await waitFor(() =>
      expect(recurrenceApi.endTaskRecurrence).toHaveBeenCalledWith(TASK_ID, { expectedVersion: 1 }),
    );
    expect(await screen.findByText("Recurrence ended")).toBeInTheDocument();
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart recurrence" })).toBeInTheDocument();
  });

  it.each([
    ["dormant", "Paused"],
    ["exhausted", "No future occurrence"],
    ["ended", "Ended"],
  ] as const)("presents the %s lifecycle honestly", async (lifecycle, label) => {
    savedRecurrence = recurrence({ lifecycle });
    renderEditor({ task: taskDetail({ status: lifecycle === "dormant" ? "cancelled" : "open" }) });

    expect(await screen.findByText(label)).toBeInTheDocument();
    if (lifecycle === "dormant") {
      expect(screen.getByText(/Missed dormant occurrences are not recreated/i)).toBeInTheDocument();
    }
  });

  it("preserves invalid values and focuses the actionable validation message", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Add recurrence" }));
    fireEvent.change(screen.getByLabelText("Repeat every"), { target: { value: "100" } });
    await user.click(screen.getByRole("button", { name: "Add recurrence" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Interval must be a whole number from 1 to 99");
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Repeat every")).toHaveValue(100);
    expect(recurrenceApi.setTaskRecurrence).not.toHaveBeenCalled();
  });

  it("preserves a conflicting draft and retries against the latest task version", async () => {
    savedRecurrence = recurrence();
    savedTaskVersion = 2;
    recurrenceApi.setTaskRecurrence.mockRejectedValueOnce(
      new TaskApiError({
        code: "CONFLICT",
        status: 409,
        detail: "Stale task version",
        currentVersion: 2,
      }),
    );
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Edit recurrence" }));
    fireEvent.change(screen.getByLabelText("Repeat every"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Save and restart" }));
    await user.click(screen.getByRole("button", { name: "Restart future recurrence" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This recurrence changed elsewhere");
    expect(screen.getByLabelText("Repeat every")).toHaveValue(2);
    const retry = within(alert).getByRole("button", { name: "Try again" });
    await waitFor(() => expect(retry).toBeEnabled());
    await user.click(retry);

    await waitFor(() => expect(recurrenceApi.setTaskRecurrence).toHaveBeenCalledTimes(2));
    expect(recurrenceApi.setTaskRecurrence.mock.calls[1]?.[1]).toMatchObject({ expectedVersion: 2 });
  });

  it("refetches an atomic series-schedule conflict before retrying the preserved recurrence", async () => {
    const monthlyDefinition = {
      preset: { kind: "monthly", interval: 1 },
      end: { kind: "never" },
    } as const;
    savedRecurrence = recurrence({ definition: monthlyDefinition });
    recurrenceApi.setTaskRecurrence.mockImplementationOnce(async () => {
      savedTaskVersion = 2;
      savedSchedule = allDaySchedule({ startDate: "2026-07-21", endDate: "2026-07-22" });
      savedRecurrence = recurrence({
        definition: monthlyDefinition,
        taskVersion: savedTaskVersion,
        cutover: {
          kind: "all_day",
          projectionStartDate: "2026-07-21",
          projectionEndDate: null,
        },
      });
      throw new TaskApiError({
        code: "CONFLICT",
        status: 409,
        detail: "A concurrent series-schedule edit won the task lock",
        currentVersion: savedTaskVersion,
      });
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Edit recurrence" }));
    await user.click(screen.getByRole("button", { name: "Save and restart" }));
    await user.click(screen.getByRole("button", { name: "Restart future recurrence" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(scheduleApi.getTaskSchedule).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(alert).toHaveTextContent("Every month on day 21"));
    expect(alert).not.toHaveTextContent("matches this attempt");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(recurrenceApi.setTaskRecurrence).toHaveBeenCalledTimes(2));
    expect(recurrenceApi.setTaskRecurrence.mock.calls[1]?.[1]).toMatchObject({
      expectedVersion: 2,
      definition: monthlyDefinition,
    });
    await waitFor(() => expect(scheduleApi.getTaskSchedule).toHaveBeenCalledTimes(4));
  });

  it("keeps conflict actions blocked until Refresh latest reloads the schedule", async () => {
    savedRecurrence = recurrence();
    recurrenceApi.setTaskRecurrence.mockImplementationOnce(async () => {
      savedTaskVersion = 2;
      savedRecurrence = recurrence({ taskVersion: savedTaskVersion });
      scheduleApi.getTaskSchedule.mockRejectedValueOnce(new TypeError("Schedule reload failed"));
      throw new TaskApiError({
        code: "CONFLICT",
        status: 409,
        detail: "Stale task version",
        currentVersion: savedTaskVersion,
      });
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Edit recurrence" }));
    fireEvent.change(screen.getByLabelText("Repeat every"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Save and restart" }));
    await user.click(screen.getByRole("button", { name: "Restart future recurrence" }));

    const alert = await screen.findByRole("alert");
    const retry = within(alert).getByRole("button", { name: "Try again" });
    await waitFor(() =>
      expect(alert).toHaveTextContent("latest recurrence and schedule could not be loaded"),
    );
    expect(retry).toBeDisabled();

    const scheduleReads = scheduleApi.getTaskSchedule.mock.calls.length;
    const recurrenceReads = recurrenceApi.getTaskRecurrence.mock.calls.length;
    const taskReads = taskApi.getTask.mock.calls.length;
    await user.click(within(alert).getByRole("button", { name: "Refresh latest" }));

    await waitFor(() => expect(retry).toBeEnabled());
    expect(scheduleApi.getTaskSchedule).toHaveBeenCalledTimes(scheduleReads + 1);
    expect(recurrenceApi.getTaskRecurrence).toHaveBeenCalledTimes(recurrenceReads + 1);
    expect(taskApi.getTask).toHaveBeenCalledTimes(taskReads + 1);
  });

  it("reconciles an applied write after a lost response without writing twice", async () => {
    recurrenceApi.setTaskRecurrence.mockImplementationOnce(async (_taskId, input) => {
      savedTaskVersion = 2;
      savedRecurrence = recurrence({ definition: input.definition, taskVersion: 2 });
      throw new TypeError("Failed to fetch");
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Add recurrence" }));
    await user.click(screen.getByRole("button", { name: "Add recurrence" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("recurrence update is unconfirmed");
    await waitFor(() => expect(alert).toHaveTextContent("matches this attempt"));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Recurrence saved")).toBeInTheDocument();
    expect(recurrenceApi.setTaskRecurrence).toHaveBeenCalledOnce();
  });

  it("renders prerequisite, offline, permission-safe, and loading states without a write path", async () => {
    const subtask = renderEditor({ task: taskDetail({ parentTaskId: LIST_ID }) });
    expect(screen.getByText("Recurrence is available only for root tasks.")).toBeInTheDocument();
    expect(recurrenceApi.getTaskRecurrence).not.toHaveBeenCalled();
    subtask.unmount();

    const noSchedule = renderEditor({ schedule: null });
    expect(await screen.findByText("Add a schedule before adding recurrence.")).toBeInTheDocument();
    noSchedule.unmount();

    const offline = renderEditor({ disabled: true });
    expect(await screen.findByRole("button", { name: "Add recurrence" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect to edit recurrence");
    offline.unmount();

    recurrenceApi.getTaskRecurrence.mockRejectedValueOnce(
      new TaskApiError({ code: "NOT_FOUND", status: 404, detail: "Not found" }),
    );
    const permission = renderEditor();
    expect(await screen.findByRole("alert")).toHaveTextContent("Recurrence is unavailable");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    permission.unmount();

    const pending = deferred<TaskRecurrenceDto | null>();
    recurrenceApi.getTaskRecurrence.mockReturnValueOnce(pending.promise);
    const loading = renderEditor();
    expect(screen.getByRole("status")).toHaveTextContent("Loading recurrence");
    loading.unmount();
    pending.resolve(null);
  });
});

function renderEditor({
  disabled = false,
  schedule = allDaySchedule(),
  task = taskDetail(),
}: Readonly<{
  disabled?: boolean;
  schedule?: TaskScheduleDto | null;
  task?: TaskDetailDto;
}> = {}) {
  scheduleApi.getTaskSchedule.mockResolvedValueOnce(schedule);
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <TaskRecurrenceEditor disabled={disabled} task={task} />
    </QueryClientProvider>,
  );
}

function taskDetail(overrides: Partial<TaskDetailDto> = {}): TaskDetailDto {
  return {
    id: TASK_ID,
    version: 1,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
    deletedAt: null,
    listId: LIST_ID,
    sectionId: null,
    parentTaskId: null,
    title: "Prepare demo",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: "2026-07-19T01:00:00.000Z",
    checklistItems: [],
    subtasks: [],
    tags: [],
    ...overrides,
  };
}

function allDaySchedule(
  overrides: Partial<Extract<TaskScheduleDto, { kind: "all_day" }>> = {},
): Extract<TaskScheduleDto, { kind: "all_day" }> {
  return {
    taskId: TASK_ID,
    kind: "all_day",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function recurrence(overrides: Partial<TaskRecurrenceDto> = {}): TaskRecurrenceDto {
  const lifecycle = overrides.lifecycle ?? "active";
  return {
    taskId: TASK_ID,
    taskVersion: 1,
    generationMode: "schedule",
    timezone: "Asia/Singapore",
    definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
    cutover: {
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: lifecycle === "ended" ? "2026-07-25" : null,
    },
    lifecycle,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
