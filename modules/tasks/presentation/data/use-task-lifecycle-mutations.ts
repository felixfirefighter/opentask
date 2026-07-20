"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { TaskDetailDto, TaskListItemDto, TaskStatus } from "../../application/contracts";
import { expectedVersionForRetry } from "./expected-version-for-retry";
import { deleteTask, getTask, restoreTask, transitionTaskStatus } from "./task-api-client";
import { patchTask, prependTask, removeTask, taskListItem, type TaskPageCache } from "./task-cache";
import { taskQueryKeys } from "./task-query-keys";

type StatusVariables = Readonly<{
  task: TaskListItemDto | TaskDetailDto;
  status: TaskStatus;
}>;

export function useTaskStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status }: StatusVariables) =>
      transitionTaskStatus(task.id, { expectedVersion: task.version, status }),
    onMutate: async ({ task, status }) => {
      const listKey = task.parentTaskId === null ? taskQueryKeys.list(task.listId) : null;
      const detailKey = taskQueryKeys.detail(task.id);
      const parentDetailKey = task.parentTaskId ? taskQueryKeys.detail(task.parentTaskId) : null;
      const sourceTerminalKey = task.status === "open" ? null : taskQueryKeys.terminal(task.status);
      const destinationTerminalKey = status === "open" ? null : taskQueryKeys.terminal(status);
      await Promise.all([
        ...(listKey ? [queryClient.cancelQueries({ queryKey: listKey })] : []),
        queryClient.cancelQueries({ queryKey: detailKey }),
        ...(parentDetailKey ? [queryClient.cancelQueries({ queryKey: parentDetailKey })] : []),
        ...(sourceTerminalKey ? [queryClient.cancelQueries({ queryKey: sourceTerminalKey })] : []),
        ...(destinationTerminalKey ? [queryClient.cancelQueries({ queryKey: destinationTerminalKey })] : []),
      ]);
      const previousList = listKey ? queryClient.getQueryData<TaskPageCache>(listKey) : undefined;
      const previousDetail = queryClient.getQueryData<TaskDetailDto>(detailKey);
      const previousParentDetail = parentDetailKey
        ? queryClient.getQueryData<TaskDetailDto>(parentDetailKey)
        : undefined;
      const previousSourceTerminal = sourceTerminalKey
        ? queryClient.getQueryData<TaskPageCache>(sourceTerminalKey)
        : undefined;
      const previousDestinationTerminal = destinationTerminalKey
        ? queryClient.getQueryData<TaskPageCache>(destinationTerminalKey)
        : undefined;
      const optimistic = taskListItem(
        { ...task, status, statusChangedAt: new Date().toISOString() },
        task.tags,
      );
      if (listKey) {
        queryClient.setQueryData<TaskPageCache>(listKey, (cache) =>
          status === "open"
            ? prependTask(removeTask(cache, task.id), optimistic)
            : removeTask(cache, task.id),
        );
      }
      queryClient.setQueryData<TaskDetailDto>(detailKey, (detail) =>
        detail ? { ...detail, status, statusChangedAt: optimistic.statusChangedAt } : detail,
      );
      if (parentDetailKey) {
        queryClient.setQueryData<TaskDetailDto>(parentDetailKey, (detail) =>
          detail
            ? {
                ...detail,
                subtasks: detail.subtasks.map((subtask) =>
                  subtask.id === task.id
                    ? { ...subtask, status, statusChangedAt: optimistic.statusChangedAt }
                    : subtask,
                ),
              }
            : detail,
        );
      }
      if (sourceTerminalKey)
        queryClient.setQueryData<TaskPageCache>(sourceTerminalKey, (cache) => removeTask(cache, task.id));
      if (destinationTerminalKey)
        queryClient.setQueryData<TaskPageCache>(destinationTerminalKey, (cache) =>
          prependTask(removeTask(cache, task.id), optimistic),
        );
      return {
        listKey,
        detailKey,
        parentDetailKey,
        sourceTerminalKey,
        destinationTerminalKey,
        previousList,
        previousDetail,
        previousParentDetail,
        previousSourceTerminal,
        previousDestinationTerminal,
      };
    },
    onError: (error, _variables, context) => {
      if (!context) return;
      if (context.listKey) queryClient.setQueryData(context.listKey, context.previousList);
      queryClient.setQueryData(context.detailKey, context.previousDetail);
      if (context.parentDetailKey)
        queryClient.setQueryData(context.parentDetailKey, context.previousParentDetail);
      if (context.sourceTerminalKey)
        queryClient.setQueryData(context.sourceTerminalKey, context.previousSourceTerminal);
      if (context.destinationTerminalKey)
        queryClient.setQueryData(context.destinationTerminalKey, context.previousDestinationTerminal);
      toast.error("Task change not saved", {
        description:
          error instanceof Error && "code" in error && error.code === "CONFLICT"
            ? "The task changed elsewhere. The latest state is being loaded."
            : "The previous state has been restored.",
      });
    },
    onSuccess: (updated, { task, status }) => {
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(task.id), (detail) =>
        detail ? { ...detail, ...updated } : detail,
      );
      if (task.parentTaskId) {
        queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(task.parentTaskId), (detail) =>
          detail
            ? {
                ...detail,
                subtasks: detail.subtasks.map((subtask) => (subtask.id === updated.id ? updated : subtask)),
              }
            : detail,
        );
      }
      if (status !== "open") {
        queryClient.setQueryData<TaskPageCache>(taskQueryKeys.terminal(status), (cache) =>
          patchTask(cache, task.id, (row) => taskListItem(updated, row.tags)),
        );
        showStatusUndo(queryClient, updated, status);
      } else if (task.status !== "open" && task.parentTaskId === null) {
        queryClient.setQueryData<TaskPageCache>(taskQueryKeys.list(updated.listId), (cache) =>
          patchTask(cache, task.id, (row) => taskListItem(updated, row.tags)),
        );
      }
    },
    onSettled: (_value, _error, { task }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(task.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detailRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}

export function useDeleteTaskMutation(onDeleted?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: TaskDetailDto | TaskListItemDto) => deleteTask(task.id, task.version),
    onSuccess: (deleted) => {
      onDeleted?.();
      void invalidateTask(queryClient, deleted.listId);
      toast.success("Task deleted", {
        action: {
          label: "Undo",
          onClick: () => void restoreDeletedTask(queryClient, deleted, deleted.version),
        },
      });
    },
    onError: (_error, task) => invalidateTask(queryClient, task.listId),
  });
}

function showStatusUndo(
  queryClient: ReturnType<typeof useQueryClient>,
  task: Awaited<ReturnType<typeof transitionTaskStatus>>,
  status: Exclude<TaskStatus, "open">,
) {
  toast.success(status === "completed" ? "Task completed" : "Task cancelled", {
    action: {
      label: "Undo",
      onClick: () => void reopenTask(queryClient, task, task.version),
    },
  });
}

async function restoreDeletedTask(
  queryClient: ReturnType<typeof useQueryClient>,
  task: Awaited<ReturnType<typeof deleteTask>>,
  expectedVersion: number,
) {
  try {
    await restoreTask(task.id, expectedVersion);
  } catch (error) {
    const activeTask = await getTask(task.id).catch(() => null);
    await invalidateTask(queryClient, task.listId).catch(() => undefined);
    if (activeTask) {
      toast.success("Task restored");
      return;
    }
    const retryVersion = expectedVersionForRetry(error, expectedVersion);
    toast.error("Task could not be restored", {
      description: "The task list was refreshed. You can retry the restore safely.",
      action: {
        label: "Retry",
        onClick: () => void restoreDeletedTask(queryClient, task, retryVersion),
      },
    });
    return;
  }
  await invalidateTask(queryClient, task.listId).catch(() => undefined);
  toast.success("Task restored");
}

async function reopenTask(
  queryClient: ReturnType<typeof useQueryClient>,
  task: Awaited<ReturnType<typeof transitionTaskStatus>>,
  expectedVersion: number,
) {
  try {
    await transitionTaskStatus(task.id, { expectedVersion, status: "open" });
  } catch (error) {
    const currentTask = await getTask(task.id).catch(() => null);
    await invalidateTask(queryClient, task.listId).catch(() => undefined);
    if (currentTask?.status === "open") {
      toast.success("Task restored");
      return;
    }
    const retryVersion = currentTask?.version ?? expectedVersionForRetry(error, expectedVersion);
    toast.error("Task could not be restored", {
      description: "The task list was refreshed. You can retry the restore safely.",
      action: {
        label: "Retry",
        onClick: () => void reopenTask(queryClient, task, retryVersion),
      },
    });
    return;
  }
  await invalidateTask(queryClient, task.listId).catch(() => undefined);
  toast.success("Task restored");
}

async function invalidateTask(queryClient: ReturnType<typeof useQueryClient>, listId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(listId) }),
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.detailRoot() }),
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
  ]);
}
