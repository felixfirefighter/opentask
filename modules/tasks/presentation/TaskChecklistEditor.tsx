"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ChecklistItemDto, TaskDetailDto } from "../application/contracts";
import {
  useCreateChecklistItemMutation,
  useDeleteChecklistItemMutation,
  usePositionChecklistItemMutation,
  useUpdateChecklistItemMutation,
} from "./data/use-task-step-mutations";
import { SortableTaskStep } from "./SortableTaskStep";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useCreateDraftResourceId } from "./useCreateDraftResourceId";
import { TaskChecklistDeleteDialog } from "./TaskChecklistDeleteDialog";
import { TaskStepMenu } from "./TaskStepMenu";
import { TaskStepSortContext } from "./TaskStepSortContext";
import styles from "./TaskStepsEditor.module.css";

export function TaskChecklistEditor({
  disabled,
  task,
}: Readonly<{ disabled: boolean; task: TaskDetailDto }>) {
  const [title, setTitle] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [deletingItem, setDeletingItem] = useState<ChecklistItemDto | null>(null);
  const create = useCreateChecklistItemMutation();
  const createResource = useCreateDraftResourceId();
  const update = useUpdateChecklistItemMutation();
  const position = usePositionChecklistItemMutation();
  const remove = useDeleteChecklistItemMutation();
  const reorderDisabled =
    disabled || create.isPending || position.isPending || update.isPending || remove.isPending;
  useTaskDraftGuard(task.id, "checklist-create", Boolean(title.trim()) || create.isPending || create.isError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    try {
      await create.mutateAsync({
        taskId: task.id,
        resourceId: createResource.resourceId(cleanTitle),
        title: cleanTitle,
      });
      createResource.confirm(cleanTitle);
      setTitle("");
    } catch {
      // Preserve the checklist draft for retry.
    }
  }

  function move(item: ChecklistItemDto, overItemId: string) {
    if (reorderDisabled) return;
    const from = task.checklistItems.findIndex((row) => row.id === item.id);
    const to = task.checklistItems.findIndex((row) => row.id === overItemId);
    if (from < 0 || to < 0 || from === to) return;
    position.mutate(
      {
        taskId: task.id,
        item,
        overItemId,
        placement: { kind: from < to ? "after" : "before", anchorId: overItemId },
      },
      {
        onSuccess: () => setAnnouncement(`${item.title} moved to position ${to + 1}.`),
        onError: () => setAnnouncement(`${item.title} returned to its previous position.`),
      },
    );
  }

  return (
    <div className={styles.subgroup}>
      <div className={styles.subheading}>
        <h3>Checklist</h3>
        <span>
          {task.checklistItems.filter((item) => item.isCompleted).length} of {task.checklistItems.length}
        </span>
      </div>
      {task.checklistItems.length > 0 ? (
        <TaskStepSortContext
          disabled={reorderDisabled}
          items={task.checklistItems.map((item) => ({ id: item.id, label: item.title }))}
          onMove={(activeId, overId) => {
            const active = task.checklistItems.find((item) => item.id === activeId);
            if (active) move(active, overId);
          }}
        >
          <div className={styles.checklist}>
            {task.checklistItems.map((item, index) => (
              <SortableTaskStep
                className={styles.checkItem!}
                disabled={reorderDisabled}
                id={item.id}
                key={item.id}
                label={item.title}
              >
                {(handle) => (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.isCompleted}
                        disabled={disabled || update.isPending}
                        onChange={() =>
                          update.mutate({
                            taskId: task.id,
                            item,
                            patch: { isCompleted: !item.isCompleted },
                          })
                        }
                      />
                      <span data-completed={item.isCompleted || undefined}>{item.title}</span>
                    </label>
                    {handle}
                    <TaskStepMenu
                      canMoveEarlier={index > 0}
                      canMoveLater={index < task.checklistItems.length - 1}
                      disabled={reorderDisabled}
                      label={item.title}
                      onMoveEarlier={() => move(item, task.checklistItems[index - 1]!.id)}
                      onMoveLater={() => move(item, task.checklistItems[index + 1]!.id)}
                      onRemove={() => {
                        if (!reorderDisabled) setDeletingItem(item);
                      }}
                    />
                  </>
                )}
              </SortableTaskStep>
            ))}
          </div>
        </TaskStepSortContext>
      ) : (
        <p className={styles.empty}>No checklist items.</p>
      )}
      <form className={styles.addForm} onSubmit={submit}>
        <label htmlFor={`checklist-${task.id}`}>Add checklist item</label>
        <div>
          <input
            id={`checklist-${task.id}`}
            value={title}
            maxLength={500}
            disabled={disabled || create.isPending}
            onChange={(event) => {
              const nextTitle = event.target.value;
              if (createResource.payloadChanged(nextTitle.trim())) create.reset();
              setTitle(nextTitle);
            }}
            placeholder="Checklist item"
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
      {deletingItem ? (
        <TaskChecklistDeleteDialog
          error={remove.error}
          disabled={disabled}
          item={deletingItem}
          pending={remove.isPending}
          onCancel={() => {
            if (!remove.isPending) setDeletingItem(null);
          }}
          onConfirm={async () => {
            if (disabled || remove.isPending) return;
            try {
              await remove.mutateAsync({ taskId: task.id, item: deletingItem });
              setDeletingItem(null);
            } catch {
              // Keep the confirmation open with its scoped recovery message.
            }
          }}
        />
      ) : null}
      {(create.error || update.error || position.error || remove.error) && (
        <p className={styles.error} role="alert">
          That checklist change was not saved. The latest saved checklist is shown.
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
