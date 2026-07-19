import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto, TaskScheduleDto } from "../application/contracts";
import { TaskApiError } from "./data/task-api-request";
import { clearTaskDrafts } from "./task-draft-guard";

const scheduleApi = vi.hoisted(() => ({
  clearTaskSchedule: vi.fn(),
  getSchedulePreferences: vi.fn(),
  getTaskSchedule: vi.fn(),
  setTaskSchedule: vi.fn(),
}));
const taskApi = vi.hoisted(() => ({ getTask: vi.fn() }));

vi.mock("./data/task-schedule-api-client", () => scheduleApi);
vi.mock("./data/task-api-client", () => ({ getTask: taskApi.getTask }));

import { TaskScheduleEditor } from "./TaskScheduleEditor";

const TASK_ID = "00000000-0000-4000-8000-000000000010";
const LIST_ID = "00000000-0000-4000-8000-000000000020";
let savedSchedule: TaskScheduleDto | null;

beforeEach(() => {
  vi.clearAllMocks();
  clearTaskDrafts(TASK_ID);
  savedSchedule = null;
  scheduleApi.getSchedulePreferences.mockResolvedValue({ timeZone: "Asia/Singapore", hourCycle: "h23" });
  scheduleApi.getTaskSchedule.mockImplementation(async () => savedSchedule);
  scheduleApi.setTaskSchedule.mockImplementation(async (taskId, input) => {
    savedSchedule = {
      taskId,
      ...input.schedule,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    } as TaskScheduleDto;
    return { task: { id: taskId, version: input.expectedVersion + 1 }, schedule: savedSchedule };
  });
  scheduleApi.clearTaskSchedule.mockImplementation(async (taskId, input) => {
    savedSchedule = null;
    return { task: { id: taskId, version: input.expectedVersion + 1 }, schedule: null };
  });
  taskApi.getTask.mockResolvedValue(taskDetail({ version: 2 }));
});

describe("TaskScheduleEditor", () => {
  it("adds a timezone-aware timed schedule through the canonical schedule command", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Add schedule" }));
    await user.click(screen.getByLabelText("Specific time"));
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-07-20T09:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-07-20T10:30" } });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() =>
      expect(scheduleApi.setTaskSchedule).toHaveBeenCalledWith(TASK_ID, {
        expectedVersion: 1,
        schedule: {
          kind: "timed",
          startAt: "2026-07-20T01:00:00Z",
          endAt: "2026-07-20T02:30:00Z",
          timezone: "Asia/Singapore",
        },
      }),
    );
    expect(await screen.findByText("Schedule saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit schedule" })).toBeInTheDocument();
  });

  it("loads and clears an all-day schedule through the dedicated clear command", async () => {
    savedSchedule = allDaySchedule();
    const user = userEvent.setup();
    renderEditor();

    expect(await screen.findByText(/All day · Jul 20, 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear schedule" }));

    await waitFor(() =>
      expect(scheduleApi.clearTaskSchedule).toHaveBeenCalledWith(TASK_ID, { expectedVersion: 1 }),
    );
    expect(await screen.findByText("Schedule removed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add schedule" })).toBeInTheDocument();
  });

  it("edits a loaded schedule without changing its all-day date semantics", async () => {
    savedSchedule = allDaySchedule();
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Edit schedule" }));
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-07-20");
    expect(screen.getByLabelText("End date (exclusive)")).toHaveValue("2026-07-21");
    fireEvent.change(screen.getByLabelText("End date (exclusive)"), {
      target: { value: "2026-07-23" },
    });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() =>
      expect(scheduleApi.setTaskSchedule).toHaveBeenCalledWith(TASK_ID, {
        expectedVersion: 1,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-23" },
      }),
    );
  });

  it("keeps invalid all-day input local and focuses an actionable error", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Add schedule" }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText("End date (exclusive)"), {
      target: { value: "2026-07-20" },
    });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("End date must be after start date.");
    expect(alert).toHaveFocus();
    expect(scheduleApi.setTaskSchedule).not.toHaveBeenCalled();
  });

  it("renders loading, load-error, and offline-safe states without enabling writes", async () => {
    const pendingSchedule = deferred<TaskScheduleDto | null>();
    scheduleApi.getTaskSchedule.mockReturnValueOnce(pendingSchedule.promise);
    const loadingView = renderEditor();

    expect(screen.getByRole("status")).toHaveTextContent("Loading schedule");
    loadingView.unmount();
    pendingSchedule.resolve(null);

    scheduleApi.getTaskSchedule.mockRejectedValueOnce(new Error("offline"));
    const errorView = renderEditor();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    errorView.unmount();

    renderEditor({ disabled: true });
    expect(await screen.findByRole("button", { name: "Add schedule" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect to edit this schedule");
  });

  it("preserves the draft on conflict and retries against the latest task version", async () => {
    const conflict = new TaskApiError({
      code: "CONFLICT",
      status: 409,
      detail: "Stale task version",
      currentVersion: 2,
    });
    scheduleApi.setTaskSchedule.mockRejectedValueOnce(conflict);
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Add schedule" }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText("End date (exclusive)"), {
      target: { value: "2026-07-22" },
    });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This schedule changed elsewhere");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-07-20");
    const retry = screen.getByRole("button", { name: "Try again" });
    await waitFor(() => expect(retry).toBeEnabled());
    await user.click(retry);

    await waitFor(() => expect(scheduleApi.setTaskSchedule).toHaveBeenCalledTimes(2));
    expect(scheduleApi.setTaskSchedule.mock.calls[1]?.[1]).toMatchObject({ expectedVersion: 2 });
    expect(await screen.findByText("Schedule saved")).toBeInTheDocument();
  });
});

function renderEditor({ disabled = false }: Readonly<{ disabled?: boolean }> = {}) {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <TaskScheduleEditor disabled={disabled} task={taskDetail()} />
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

function allDaySchedule(): TaskScheduleDto {
  return {
    taskId: TASK_ID,
    kind: "all_day",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
