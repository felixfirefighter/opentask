import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChecklistItemDto, TaskDetailDto, TaskDto } from "../../application/contracts";
import { taskQueryKeys } from "./task-query-keys";
import { usePositionChecklistItemMutation, usePositionSubtaskMutation } from "./use-task-step-mutations";

const taskApi = vi.hoisted(() => ({
  createChecklistItem: vi.fn(),
  createTask: vi.fn(),
  deleteChecklistItem: vi.fn(),
  positionChecklistItem: vi.fn(),
  positionTask: vi.fn(),
  updateChecklistItem: vi.fn(),
}));

vi.mock("./task-api-client", () => taskApi);

const PARENT_ID = "52a8bc35-2a7e-44ea-84c1-626383effc70";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const SUBTASK_A_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const SUBTASK_B_ID = "f1c528b7-cfc6-4fe6-b5c2-9b536434a6fd";
const CHECK_A_ID = "667aaef1-f0bc-4b5d-bff2-ed6c33ad99b5";
const CHECK_B_ID = "7b2b79d3-ad4f-4c5a-a7b5-f0ce6674c6c1";

beforeEach(() => vi.clearAllMocks());

describe("step reorder mutations", () => {
  it("reorders the parent subtask projection and restores its exact snapshot on rejection", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    taskApi.positionTask.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const client = queryClient();
    const original = detail();
    client.setQueryData(taskQueryKeys.detail(PARENT_ID), original);
    const { result } = renderHook(() => usePositionSubtaskMutation(), {
      wrapper: queryWrapper(client),
    });

    act(() =>
      result.current.mutate({
        parentTaskId: PARENT_ID,
        subtask: original.subtasks[1]!,
        overTaskId: SUBTASK_A_ID,
        placement: { kind: "before", anchorId: SUBTASK_A_ID },
      }),
    );

    await waitFor(() => expect(subtaskIds(client)).toEqual([SUBTASK_B_ID, SUBTASK_A_ID]));
    expect(taskApi.positionTask).toHaveBeenCalledWith(SUBTASK_B_ID, {
      expectedVersion: 1,
      placement: { kind: "before", anchorId: SUBTASK_A_ID },
    });
    act(() => rejectRequest?.(new Error("conflict")));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(taskQueryKeys.detail(PARENT_ID))).toEqual(original);
  });

  it("optimistically reorders checklist items and restores versions, ranks, and order on rejection", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    taskApi.positionChecklistItem.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const client = queryClient();
    const original = detail();
    client.setQueryData(taskQueryKeys.detail(PARENT_ID), original);
    const { result } = renderHook(() => usePositionChecklistItemMutation(), {
      wrapper: queryWrapper(client),
    });

    act(() =>
      result.current.mutate({
        taskId: PARENT_ID,
        item: original.checklistItems[0]!,
        overItemId: CHECK_B_ID,
        placement: { kind: "after", anchorId: CHECK_B_ID },
      }),
    );

    await waitFor(() => expect(checklistIds(client)).toEqual([CHECK_B_ID, CHECK_A_ID]));
    expect(taskApi.positionChecklistItem).toHaveBeenCalledWith(PARENT_ID, CHECK_A_ID, {
      expectedVersion: 4,
      placement: { kind: "after", anchorId: CHECK_B_ID },
    });
    act(() => rejectRequest?.(new Error("offline")));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(taskQueryKeys.detail(PARENT_ID))).toEqual(original);
  });
});

function queryClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function queryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function subtaskIds(client: QueryClient) {
  return client.getQueryData<TaskDetailDto>(taskQueryKeys.detail(PARENT_ID))?.subtasks.map((row) => row.id);
}

function checklistIds(client: QueryClient) {
  return client
    .getQueryData<TaskDetailDto>(taskQueryKeys.detail(PARENT_ID))
    ?.checklistItems.map((row) => row.id);
}

function detail(): TaskDetailDto {
  return {
    ...task(PARENT_ID, null, "Parent", "a0"),
    checklistItems: [
      checklist(CHECK_A_ID, "First check", "a0", 4),
      checklist(CHECK_B_ID, "Second check", "a1", 7),
    ],
    tags: [],
    subtasks: [
      task(SUBTASK_A_ID, PARENT_ID, "First subtask", "a0"),
      task(SUBTASK_B_ID, PARENT_ID, "Second subtask", "a1"),
    ],
  };
}

function task(id: string, parentTaskId: string | null, title: string, rank: string): TaskDto {
  return {
    id,
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
    listId: LIST_ID,
    sectionId: null,
    parentTaskId,
    title,
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank,
    statusChangedAt: "2026-07-19T00:00:00.000Z",
  };
}

function checklist(id: string, title: string, rank: string, version: number): ChecklistItemDto {
  return {
    id,
    taskId: PARENT_ID,
    version,
    title,
    isCompleted: false,
    rank,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}
