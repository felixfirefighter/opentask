"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import type { TaskDetailDto, TaskPage } from "../../application/contracts";
import { getTask, listTasks, listTerminalTasks, searchTasks } from "./task-api-client";
import { flattenTaskPages, flattenTaskSearchPages } from "./task-page-view";
import { taskQueryKeys } from "./task-query-keys";

const TASK_PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 20;

export function useTaskListQuery(listId: string, initialPage?: TaskPage) {
  const query = useInfiniteQuery({
    queryKey: taskQueryKeys.list(listId),
    queryFn: ({ pageParam }) =>
      listTasks({
        listId,
        parentTaskId: null,
        status: "open",
        limit: TASK_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...(initialPage ? { initialData: { pages: [initialPage], pageParams: [undefined] } } : {}),
  });
  const tasks = useMemo(() => flattenTaskPages(query.data?.pages), [query.data?.pages]);

  return { ...query, tasks };
}

export function useTerminalTaskQuery(status: "completed" | "cancelled", initialPage?: TaskPage) {
  const query = useInfiniteQuery({
    queryKey: taskQueryKeys.terminal(status),
    queryFn: ({ pageParam }) =>
      listTerminalTasks({
        status,
        limit: TASK_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...(initialPage ? { initialData: { pages: [initialPage], pageParams: [undefined] } } : {}),
  });
  const tasks = useMemo(() => flattenTaskPages(query.data?.pages), [query.data?.pages]);

  return { ...query, tasks };
}

export function useTaskDetailQuery(taskId: string, initialTask?: TaskDetailDto, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = taskQueryKeys.detail(taskId);
  const query = useQuery({
    queryKey,
    queryFn: () => getTask(taskId),
    initialData: initialTask,
    enabled,
  });
  const data =
    initialTask && (!query.data || initialTask.version > query.data.version) ? initialTask : query.data;

  useEffect(() => {
    if (!initialTask) return;
    queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(taskId), (current) =>
      !current || initialTask.version > current.version ? initialTask : current,
    );
  }, [initialTask, queryClient, taskId]);

  return { ...query, data };
}

export function useTaskSearchQuery(searchText: string) {
  const queryText = searchText.trim();
  const query = useInfiniteQuery({
    queryKey: taskQueryKeys.search(queryText),
    queryFn: ({ pageParam }) =>
      searchTasks({
        q: queryText,
        limit: SEARCH_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: queryText.length > 0,
  });
  const results = useMemo(() => flattenTaskSearchPages(query.data?.pages), [query.data?.pages]);

  return { ...query, results };
}
