"use client";

import { useState, type MouseEvent } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import type { TaskListItemDto, TaskPriority, TaskStatus } from "../application/contracts";
import { focusAfterTaskRemoval, focusTaskRow } from "./focus-after-task-removal";
import { isTaskApiError } from "./data/task-api-request";
import { useUpdateTaskMutation } from "./data/use-task-editor-mutations";
import { useDeleteTaskMutation, useTaskStatusMutation } from "./data/use-task-lifecycle-mutations";
import { useReorderTaskMutation } from "./data/use-task-organization-mutations";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { TaskListSortContext } from "./TaskListSortContext";
import { TaskMoveDialog } from "./TaskMoveDialog";
import { SortableTaskRow } from "./SortableTaskRow";
import { taskStatusMessage, terminalTaskContext } from "./task-list-labels";
import styles from "./TaskList.module.css";

type TaskListProps = Readonly<{
  dndId?: string | undefined;
  tasks: TaskListItemDto[];
  inbox: { id: string; name: string };
  selectedTaskId?: string | null;
  reorderable?: boolean;
  terminal?: boolean;
  timeZone?: string | undefined;
  onOmplish: (task: TaskListItemDto, event: MouseEvent<HTMLAnchorElement>) => void;
}>;

export function TaskList({
  dndId = "task-list",
  inbox,
  onOmplish,
  reorderable = false,
  selectedTaskId,
  tasks,
  terminal = false,
  timeZone = "UTC",
}: TaskListProps) {
  const online = useOnlineStatus();
  const [deletingTask, setDeletingTask] = useState<TaskListItemDto | null>(null);
  const statusMutation = useTaskStatusMutation();
  const reorderMutation = useReorderTaskMutation();
  const updateMutation = useUpdateTaskMutation();
  const deleteMutation = useDeleteTaskMutation(() => {
    if (deletingTask) focusAfterTaskRemoval(deletingTask.id, tasks);
    setDeletingTask(null);
  });
  const [movingTask, setMovingTask] = useState<TaskListItemDto | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function changeStatus(task: TaskListItemDto, status: TaskStatus) {
    statusMutation.mutate(
      { task, status },
      {
        onSuccess: () => {
          setAnnouncement(taskStatusMessage(task.title, status));
        },
        onError: () => {
          setAnnouncement(`The change to ${task.title} was not saved.`);
          focusTaskRow(task.id);
        },
      },
    );
    if (status !== "open" || terminal) focusAfterTaskRemoval(task.id, tasks);
  }

  function reorder(task: TaskListItemDto, overTaskId: string) {
    const from = tasks.findIndex((row) => row.id === task.id);
    const to = tasks.findIndex((row) => row.id === overTaskId);
    if (from < 0 || to < 0 || from === to) return;
    const placement =
      from < to
        ? { kind: "after" as const, anchorId: overTaskId }
        : { kind: "before" as const, anchorId: overTaskId };
    reorderMutation.mutate(
      { task, overTaskId, input: { expectedVersion: task.version, placement } },
      {
        onSuccess: () => setAnnouncement(`${task.title} moved to position ${to + 1}.`),
        onError: () => setAnnouncement(`${task.title} returned to its previous position.`),
      },
    );
  }

  function changePriority(task: TaskListItemDto, priority: TaskPriority) {
    updateMutation.mutate(
      {
        taskId: task.id,
        listId: task.listId,
        input: { expectedVersion: task.version, patch: { priority } },
      },
      {
        onSuccess: () => setAnnouncement(`${task.title} priority updated.`),
        onError: () => setAnnouncement(`${task.title} priority was not changed.`),
      },
    );
  }

  const error = statusMutation.error ?? reorderMutation.error ?? updateMutation.error ?? deleteMutation.error;
  const disabled =
    !online ||
    statusMutation.isPending ||
    reorderMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;
  return (
    <>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {isTaskApiError(error) && error.code === "CONFLICT"
            ? "This task changed elsewhere. Review the latest version before trying again."
            : "That task change was not saved. The previous state has been restored."}
        </div>
      )}
      <TaskListSortContext
        disabled={disabled}
        dndId={dndId}
        onMove={(activeId, overId) => {
          const task = tasks.find((row) => row.id === activeId);
          if (task) reorder(task, overId);
        }}
        tasks={tasks}
      >
        <div className={styles.list} data-terminal={terminal || undefined}>
          {tasks.map((task, index) => (
            <SortableTaskRow
              key={task.id}
              task={task}
              disabled={disabled}
              detailsHref={`/tasks/${task.id}`}
              selected={selectedTaskId === task.id}
              sortable={reorderable}
              contextLabel={terminal ? terminalTaskContext(task, timeZone) : undefined}
              onOpen={(event) => onOmplish(task, event)}
              onStatusChange={(status) => changeStatus(task, status)}
              onMove={() => setMovingTask(task)}
              onPriorityChange={(priority) => changePriority(task, priority)}
              onDelete={() => setDeletingTask(task)}
              onMoveEarlier={reorderable && index > 0 ? () => reorder(task, tasks[index - 1]!.id) : undefined}
              onMoveLater={
                reorderable && index < tasks.length - 1
                  ? () => reorder(task, tasks[index + 1]!.id)
                  : undefined
              }
            />
          ))}
        </div>
      </TaskListSortContext>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      {movingTask && (
        <TaskMoveDialog
          inbox={inbox}
          open
          task={tasks.find((task) => task.id === movingTask.id) ?? movingTask}
          onOpenChange={(open) => !open && setMovingTask(null)}
        />
      )}
      {deletingTask ? (
        <TaskDeleteDialog
          disabled={!online}
          initialOpen
          mutation={deleteMutation}
          onOpenChange={(open) => !open && setDeletingTask(null)}
          showTrigger={false}
          task={tasks.find((task) => task.id === deletingTask.id) ?? deletingTask}
        />
      ) : null}
    </>
  );
}
