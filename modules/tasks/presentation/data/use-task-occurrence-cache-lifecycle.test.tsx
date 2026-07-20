import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TaskDetailDto,
  TaskListItemDto,
  TaskOccurrenceDto,
  TaskPage,
  TaskRecurrenceDto,
  TaskSearchPage,
} from "../../application/contracts";

import { taskQueryKeys } from "./task-query-keys";
import { taskOccurrenceQueryKey, useTaskOccurrenceMutation } from "./use-task-occurrence";
import { taskRecurrenceQueryKey } from "./use-task-recurrence";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
const occurrenceApi = vi.hoisted(() => ({ transitionTaskOccurrence: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("./task-occurrence-api-client", () => ({
  getTaskOccurrence: vi.fn(),
  transitionTaskOccurrence: occurrenceApi.transitionTaskOccurrence,
}));

const TASK_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const OCCURRENCE_KEY = "o1.current";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("occurrence mutation cache lifecycle", () => {
  it("invalidates every authoritative task projection after an adjacent write", async () => {
    const client = queryClient();
    const caches = seedAffectedCaches(client, 4);
    const onApplied = vi.fn();
    occurrenceApi.transitionTaskOccurrence.mockResolvedValueOnce(commandResult(4, 5));
    const { result } = renderHook(() => useTaskOccurrenceMutation(TASK_ID, OCCURRENCE_KEY, onApplied), {
      wrapper: queryWrapper(client),
    });

    await act(() =>
      result.current.mutateAsync({
        action: "complete",
        occurrenceKey: OCCURRENCE_KEY,
        expectedVersion: 4,
      }),
    );

    expect(client.getQueryData<TaskDetailDto>(caches.detail)?.version).toBe(5);
    expect(client.getQueryData<TaskOccurrenceDto>(caches.occurrence)).toMatchObject({
      occurrenceState: "completed",
      taskVersion: 5,
    });
    expect(client.getQueryData<TaskRecurrenceDto>(caches.recurrence)?.taskVersion).toBe(5);
    expectInvalidated(client, caches.invalidated);
    expectUnchanged(client, caches.authoritativeProjectionSnapshots);
    expect(onApplied).toHaveBeenCalledOnce();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("does not fabricate cache state for an ahead idempotent retry", async () => {
    const client = queryClient();
    const caches = seedAffectedCaches(client, 4);
    const onApplied = vi.fn();
    occurrenceApi.transitionTaskOccurrence.mockResolvedValueOnce({
      ...commandResult(4, 8),
      outcome: "idempotent_retry",
    });
    const { result } = renderHook(() => useTaskOccurrenceMutation(TASK_ID, OCCURRENCE_KEY, onApplied), {
      wrapper: queryWrapper(client),
    });

    await act(() =>
      result.current.mutateAsync({
        action: "complete",
        occurrenceKey: OCCURRENCE_KEY,
        expectedVersion: 4,
      }),
    );

    expect(client.getQueryData<TaskDetailDto>(caches.detail)?.version).toBe(4);
    expect(client.getQueryData<TaskOccurrenceDto>(caches.occurrence)?.taskVersion).toBe(4);
    expect(client.getQueryData<TaskRecurrenceDto>(caches.recurrence)?.taskVersion).toBe(4);
    expectInvalidated(client, caches.invalidated);
    expectUnchanged(client, caches.authoritativeProjectionSnapshots);
    expect(onApplied).not.toHaveBeenCalled();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("keeps an unconfirmed command retryable while invalidating stale task projections", async () => {
    const client = queryClient();
    const caches = seedAffectedCaches(client, 4);
    const request = {
      action: "skip",
      occurrenceKey: OCCURRENCE_KEY,
      expectedVersion: 4,
    } as const;
    occurrenceApi.transitionTaskOccurrence.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useTaskOccurrenceMutation(TASK_ID, OCCURRENCE_KEY, vi.fn()), {
      wrapper: queryWrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(request)).rejects.toThrow("Failed to fetch");
    });

    expect(result.current.variables).toEqual(request);
    expectInvalidated(client, caches.invalidated);
    expectUnchanged(client, [
      [caches.detail, caches.detailSnapshot],
      [caches.occurrence, caches.occurrenceSnapshot],
      [caches.recurrence, caches.recurrenceSnapshot],
      ...caches.authoritativeProjectionSnapshots,
    ]);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});

type CacheEntry = readonly [readonly unknown[], unknown];

function seedAffectedCaches(client: QueryClient, version: number) {
  const detail = taskQueryKeys.detail(TASK_ID);
  const occurrence = taskOccurrenceQueryKey(TASK_ID, OCCURRENCE_KEY);
  const siblingOccurrence = taskOccurrenceQueryKey(TASK_ID, "o1.sibling");
  const recurrence = taskRecurrenceQueryKey(TASK_ID);
  const list = taskQueryKeys.list(LIST_ID);
  const terminal = taskQueryKeys.terminal("completed");
  const search = taskQueryKeys.search("prepare");
  const detailSnapshot = taskDetail(version);
  const occurrenceSnapshot = occurrenceDto(version, OCCURRENCE_KEY);
  const siblingOccurrenceSnapshot = occurrenceDto(version, "o1.sibling");
  const recurrenceSnapshot = recurrenceDto(version);
  const listSnapshot = infinitePage<TaskPage>({ items: [task(version)], nextCursor: null });
  const terminalSnapshot = infinitePage<TaskPage>({
    items: [{ ...task(version), status: "completed" }],
    nextCursor: null,
  });
  const searchSnapshot = infinitePage<TaskSearchPage>(searchPage(version));

  for (const [key, value] of [
    [detail, detailSnapshot],
    [occurrence, occurrenceSnapshot],
    [siblingOccurrence, siblingOccurrenceSnapshot],
    [recurrence, recurrenceSnapshot],
    [list, listSnapshot],
    [terminal, terminalSnapshot],
    [search, searchSnapshot],
  ] as const) {
    client.setQueryData(key, value);
  }

  return {
    detail,
    detailSnapshot,
    occurrence,
    occurrenceSnapshot,
    recurrence,
    recurrenceSnapshot,
    invalidated: [detail, occurrence, siblingOccurrence, recurrence, list, terminal, search],
    authoritativeProjectionSnapshots: [
      [siblingOccurrence, siblingOccurrenceSnapshot],
      [list, listSnapshot],
      [terminal, terminalSnapshot],
      [search, searchSnapshot],
    ] satisfies CacheEntry[],
  } as const;
}

function expectInvalidated(client: QueryClient, queryKeys: readonly (readonly unknown[])[]) {
  for (const queryKey of queryKeys) {
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
  }
}

function expectUnchanged(client: QueryClient, entries: readonly CacheEntry[]) {
  for (const [queryKey, snapshot] of entries) {
    expect(client.getQueryData(queryKey)).toBe(snapshot);
  }
}

function queryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
  });
}

function infinitePage<T>(page: T): InfiniteData<T, string | undefined> {
  return { pages: [page], pageParams: [undefined] };
}

function task(version: number): TaskListItemDto {
  return {
    id: TASK_ID,
    listId: LIST_ID,
    sectionId: null,
    parentTaskId: null,
    title: "Prepare demo",
    descriptionMd: "",
    status: "open",
    priority: "high",
    rank: "a",
    statusChangedAt: "2026-07-19T00:00:00.000Z",
    tags: [],
    recurrence: { status: "active" },
    version,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}

function taskDetail(version: number): TaskDetailDto {
  return { ...task(version), checklistItems: [], subtasks: [] };
}

function searchPage(version: number): TaskSearchPage {
  const { recurrence, tags, ...taskDto } = task(version);
  return {
    items: [
      {
        task: taskDto,
        list: { id: LIST_ID, name: "Inbox" },
        recurrence,
        matchedFields: ["title"],
        matchingTags: tags,
      },
    ],
    nextCursor: null,
  };
}

function occurrenceDto(taskVersion: number, occurrenceKey: string): TaskOccurrenceDto {
  return {
    taskId: TASK_ID,
    taskVersion,
    occurrenceKey,
    occurrenceState: "open",
    transitionEligible: true,
    schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
  };
}

function recurrenceDto(taskVersion: number): TaskRecurrenceDto {
  return {
    taskId: TASK_ID,
    taskVersion,
    generationMode: "schedule",
    timezone: "Asia/Singapore",
    definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
    cutover: {
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: null,
    },
    lifecycle: "active",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function commandResult(expectedVersion: number, taskVersion: number) {
  return {
    outcome: "applied" as const,
    action: "complete" as const,
    occurrenceKey: OCCURRENCE_KEY,
    expectedVersion,
    task: { id: TASK_ID, version: taskVersion },
    occurrenceState: "completed" as const,
    eventTaskVersion: expectedVersion + 1,
  };
}
