"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { TaskDetailDto, TaskDto } from "../application/contracts";
import { taskQueryKeys } from "./data/task-query-keys";
import { useCreateSubtaskMutation, usePositionSubtaskMutation } from "./data/use-task-step-mutations";
import { useTaskStatusMutation } from "./data/use-task-lifecycle-mutations";
import { SortableTaskStep } from "./SortableTaskStep";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useCreateDraftResourceId } from "./useCreateDraftResourceId";
import { TaskStepMenu } from "./TaskStepMenu";
import { TaskStepSortContext } from "./TaskStepSortContext";
import styles from "./TaskStepsEditor.module.css";

export function TaskSubtaskEditor({ disabled, task }: Readonly<{ disabled: boolean; task: TaskDetailDto }>) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const create = useCreateSubtaskMutation();
  const createResource = useCreateDraftResourceId();
  const position = usePositionSubtaskMutation();
  const status = useTaskStatusMutation();
  const reorderDisabled = disabled || create.isPending || position.isPending || status.isPending;
  useTaskDraftGuard(task.id, "subtask-create", Boolean(title.trim()) || create.isPending || create.isError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    try {
      await create.mutateAsync({
        parent: task,
        resourceId: createResource.resourceId(cleanTitle),
        title: cleanTitle,
      });
      createResource.confirm(cleanTitle);
      setTitle("");
    } catch {
      // Preserve the draft and expose the scoped error.
    }
  }

  function move(subtask: TaskDto, overTaskId: string) {
    if (reorderDisabled) return;
    const from = task.subtasks.findIndex((row) => row.id === subtask.id);
    const to = task.subtasks.findIndex((row) => row.id === overTaskId);
    if (from < 0 || to < 0 || from === to) return;
    position.mutate(
      {
        parentTaskId: task.id,
        subtask,
        overTaskId,
        placement: { kind: from < to ? "after" : "before", anchorId: overTaskId },
      },
      {
        onSuccess: () => setAnnouncement(`${subtask.title} moved to position ${to + 1}.`),
        onError: () => setAnnouncement(`${subtask.title} returned to its previous position.`),
      },
    );
  }

  function changeStatus(subtask: TaskDto) {
    if (disabled || status.isPending) return;
    status.mutate(
      {
        task: { ...subtask, tags: [], recurrence: null },
        status: subtask.status === "open" ? "completed" : "open",
      },
      {
        onSettled: () => void queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(task.id) }),
      },
    );
  }

  return (
    <div className={styles.subgroup}>
      <div className={styles.subheading}>
        <h3>Subtasks</h3>
        <span>{task.subtasks.filter((subtask) => subtask.status === "open").length} open</span>
      </div>
      {task.subtasks.length > 0 ? (
        <TaskStepSortContext
          disabled={reorderDisabled}
          items={task.subtasks.map((subtask) => ({ id: subtask.id, label: subtask.title }))}
          onMove={(activeId, overId) => {
            const active = task.subtasks.find((subtask) => subtask.id === activeId);
            if (active) move(active, overId);
          }}
        >
          <div className={styles.subtasks}>
            {task.subtasks.map((subtask, index) => (
              <SortableTaskStep
                className={styles.subtask!}
                disabled={reorderDisabled}
                id={subtask.id}
                key={subtask.id}
                label={subtask.title}
              >
                {(handle) => (
                  <>
                    <button
                      className={styles.statusButton}
                      type="button"
                      disabled={disabled || status.isPending}
                      aria-label={
                        subtask.status === "open" ? `Complete ${subtask.title}` : `Restore ${subtask.title}`
                      }
                      onClick={() => changeStatus(subtask)}
                    >
                      {subtask.status === "open" ? (
                        <Circle size={18} aria-hidden="true" />
                      ) : subtask.status === "completed" ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <RotateCcw size={15} aria-hidden="true" />
                      )}
                    </button>
                    <Link data-status={subtask.status} href={`/tasks/${subtask.id}`}>
                      <span>{subtask.title}</span>
                      {subtask.status === "cancelled" ? (
                        <>
                          {" "}
                          <span className={styles.cancelledLabel}>Cancelled</span>
                        </>
                      ) : null}
                    </Link>
                    {handle}
                    <TaskStepMenu
                      canMoveEarlier={index > 0}
                      canMoveLater={index < task.subtasks.length - 1}
                      disabled={reorderDisabled}
                      label={subtask.title}
                      onMoveEarlier={() => move(subtask, task.subtasks[index - 1]!.id)}
                      onMoveLater={() => move(subtask, task.subtasks[index + 1]!.id)}
                    />
                  </>
                )}
              </SortableTaskStep>
            ))}
          </div>
        </TaskStepSortContext>
      ) : (
        <p className={styles.empty}>No subtasks.</p>
      )}
      {task.parentTaskId ? (
        <p className={styles.boundary}>Subtasks cannot contain another level of subtasks.</p>
      ) : (
        <form className={styles.addForm} onSubmit={submit}>
          <label htmlFor={`subtask-${task.id}`}>Add subtask</label>
          <div>
            <input
              id={`subtask-${task.id}`}
              value={title}
              maxLength={500}
              disabled={disabled || create.isPending}
              onChange={(event) => {
                const nextTitle = event.target.value;
                if (createResource.payloadChanged(nextTitle.trim())) create.reset();
                setTitle(nextTitle);
              }}
              placeholder="Subtask title"
            />
            <button
              className="secondary-button"
              type="submit"
              disabled={disabled || !title.trim() || create.isPending}
            >
              <Plus size={15} aria-hidden="true" /> Add
            </button>
          </div>
        </form>
      )}
      {(create.error || status.error || position.error) && (
        <p className={styles.error} role="alert">
          That subtask change was not saved. Your draft and prior state are preserved.
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
