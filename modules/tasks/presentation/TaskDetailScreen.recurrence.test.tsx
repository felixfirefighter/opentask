import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto } from "../application/contracts";
import type { TaskRecurrenceDto } from "../application/contracts/recurrence-contract";

const lifecycle = vi.hoisted(() => ({
  remove: { error: null, isPending: false, mutate: vi.fn() },
  status: { error: null, isPending: false, mutate: vi.fn() },
}));
const recurrenceHook = vi.hoisted(() => ({ useTaskRecurrenceQuery: vi.fn() }));

vi.mock("@/shared/presentation", () => ({ useOnlineStatus: () => true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./data/use-task-queries", () => ({
  useTaskDetailQuery: (_taskId: string, task: TaskDetailDto) => ({
    data: task,
    error: null,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("./data/use-task-lifecycle-mutations", () => ({
  useDeleteTaskMutation: () => lifecycle.remove,
  useTaskStatusMutation: () => lifecycle.status,
}));
vi.mock("./data/use-task-recurrence", () => recurrenceHook);
vi.mock("./task-draft-guard", () => ({
  clearTaskDrafts: vi.fn(),
  confirmTaskDraftNavigation: () => true,
  useTaskBeforeUnload: vi.fn(),
  useTaskHistoryGuard: vi.fn(),
}));
vi.mock("./TaskTitleEditor", () => ({ TaskTitleEditor: () => <h1>Task title</h1> }));
vi.mock("./TaskScheduleEditor", () => ({ TaskScheduleEditor: () => <div>Schedule editor</div> }));
vi.mock("./TaskRecurrenceEditor", () => ({
  TaskRecurrenceEditor: () => <div>Recurrence editor</div>,
}));
vi.mock("./TaskOrganizationEditor", () => ({
  TaskOrganizationEditor: () => <div>Organization editor</div>,
}));
vi.mock("./TaskStepsEditor", () => ({ TaskStepsEditor: () => <div>Steps editor</div> }));
vi.mock("./TaskNotesEditor", () => ({ TaskNotesEditor: () => <div>Notes editor</div> }));
vi.mock("./TaskDeleteDialog", () => ({ TaskDeleteDialog: () => null }));

import { TaskDetailScreen } from "./TaskDetailScreen";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskDetailScreen recurrence integration", () => {
  it("mounts recurrence immediately after schedule and blocks completing an active series", () => {
    recurrenceHook.useTaskRecurrenceQuery.mockReturnValue(recurrenceQuery(recurrence("active")));
    render(<TaskDetailScreen task={taskDetail()} mode="inspector" />);

    const schedule = screen.getByText("Schedule editor");
    const recurrenceEditor = screen.getByText("Recurrence editor");
    expect(
      schedule.compareDocumentPosition(recurrenceEditor) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute(
      "title",
      "End recurrence before completing this task",
    );
  });

  it("restores whole-task completion once recurrence is ended", async () => {
    recurrenceHook.useTaskRecurrenceQuery.mockReturnValue(recurrenceQuery(recurrence("ended")));
    const user = userEvent.setup();
    render(<TaskDetailScreen task={taskDetail()} mode="inspector" />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(lifecycle.status.mutate).toHaveBeenCalledWith({ task: taskDetail(), status: "completed" });
  });

  it("waits for authoritative recurrence state before enabling completion", () => {
    recurrenceHook.useTaskRecurrenceQuery.mockReturnValue({
      data: undefined,
      isSuccess: false,
    });
    render(<TaskDetailScreen task={taskDetail()} mode="inspector" />);

    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute(
      "title",
      "Loading recurrence status",
    );
  });
});

function recurrenceQuery(data: TaskRecurrenceDto | null) {
  return { data, isSuccess: true };
}

function recurrence(lifecycleState: TaskRecurrenceDto["lifecycle"]): TaskRecurrenceDto {
  return {
    taskId: "00000000-0000-4000-8000-000000000010",
    taskVersion: 1,
    generationMode: "schedule",
    timezone: "Asia/Singapore",
    definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
    cutover: {
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: lifecycleState === "ended" ? "2026-07-25" : null,
    },
    lifecycle: lifecycleState,
    createdAt: "2026-07-19T00:00:00Z",
    updatedAt: "2026-07-19T00:00:00Z",
  };
}

function taskDetail(): TaskDetailDto {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    version: 1,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
    deletedAt: null,
    listId: "00000000-0000-4000-8000-000000000020",
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
  };
}
