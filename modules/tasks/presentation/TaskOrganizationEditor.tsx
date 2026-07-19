"use client";

import { Flag, ListTodo, Tag } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { TaskDetailDto, TaskPriority } from "../application/contracts";
import { useRegularListsQuery, useSectionsQuery } from "./data/use-organizer-queries";
import { useUpdateTaskMutation } from "./data/use-task-editor-mutations";
import { TaskMoveDialog } from "./TaskMoveDialog";
import { TaskTagDialog } from "./TaskTagDialog";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";
import styles from "./TaskOrganizationEditor.module.css";

export function TaskOrganizationEditor({
  disabled,
  inbox,
  task,
}: Readonly<{
  disabled: boolean;
  inbox: { id: string; name: string };
  task: TaskDetailDto;
}>) {
  const listsQuery = useRegularListsQuery();
  const sectionsQuery = useSectionsQuery(task.listId, task.listId !== inbox.id);
  const update = useUpdateTaskMutation();
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [priorityDirty, setPriorityDirty] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const priorityRef = useRef<HTMLSelectElement>(null);
  const recovery = useTaskConflictRecovery(task, update.error);
  const authoritativeTask = recovery.conflict ? recovery.latestTask : task;

  const visiblePriority = priorityDirty || update.isError ? priority : task.priority;
  useTaskDraftGuard(task.id, "priority", priorityDirty || update.isPending || update.isError);

  const listName = useMemo(
    () =>
      task.listId === inbox.id
        ? inbox.name
        : (listsQuery.lists.find((list) => list.id === task.listId)?.name ?? "Current list"),
    [inbox.id, inbox.name, listsQuery.lists, task.listId],
  );
  const knownSection = sectionsQuery.sections.find((section) => section.id === task.sectionId);
  const sectionName =
    task.sectionId === null
      ? "No section"
      : (knownSection?.name ?? (sectionsQuery.isPending ? "Loading section…" : "Current section"));

  function savePriority(nextPriority: TaskPriority, force = false) {
    setPriority(nextPriority);
    setPriorityDirty(true);
    if (disabled || update.isPending || (recovery.conflict && (!force || !recovery.latestReady))) {
      return;
    }
    if (nextPriority === authoritativeTask.priority) {
      setPriority(authoritativeTask.priority);
      setPriorityDirty(false);
      update.reset();
      return;
    }
    update.mutate(
      {
        taskId: task.id,
        listId: authoritativeTask.listId,
        input: {
          expectedVersion: authoritativeTask.version,
          patch: { priority: nextPriority },
        },
      },
      { onSuccess: () => setPriorityDirty(false) },
    );
  }

  return (
    <section className={styles.group} aria-labelledby={`organization-${task.id}`}>
      <h2 id={`organization-${task.id}`}>Organization</h2>
      <label className={styles.field}>
        <span className={styles.icon}>
          <Flag size={17} aria-hidden="true" />
        </span>
        <span>Priority</span>
        <select
          ref={priorityRef}
          value={visiblePriority}
          disabled={disabled || update.isPending}
          onChange={(event) => savePriority(event.target.value as TaskPriority)}
          aria-describedby={update.error ? `priority-error-${task.id}` : undefined}
        >
          <option value="none">None</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <button
        className={styles.field}
        type="button"
        disabled={disabled || task.parentTaskId !== null}
        aria-describedby={task.parentTaskId ? `subtask-list-boundary-${task.id}` : undefined}
        onClick={() => setMoveOpen(true)}
      >
        <span className={styles.icon}>
          <ListTodo size={17} aria-hidden="true" />
        </span>
        <span>List and section</span>
        <strong>
          {listName} · {sectionName}
        </strong>
      </button>
      {task.parentTaskId ? (
        <p className={styles.boundary} id={`subtask-list-boundary-${task.id}`}>
          Move the parent task to change this subtask’s list.
        </p>
      ) : null}
      <button className={styles.field} type="button" disabled={disabled} onClick={() => setTagsOpen(true)}>
        <span className={styles.icon}>
          <Tag size={17} aria-hidden="true" />
        </span>
        <span>Tags</span>
        <strong>{task.tags.length > 0 ? task.tags.map((tag) => tag.name).join(" · ") : "No tags"}</strong>
      </button>

      {update.error && (
        <div className={styles.error} id={`priority-error-${task.id}`} role="alert">
          <span>
            {recovery.conflict
              ? "This task changed elsewhere. Your priority choice is preserved."
              : "Priority was not saved."}
          </span>
          {recovery.conflict ? (
            <span>
              {recovery.latestReady
                ? `Your choice: ${priorityLabel(priority)}. Latest saved priority: ${priorityLabel(recovery.latestTask.priority)}.`
                : recovery.loadingLatest
                  ? "Loading the latest saved priority…"
                  : "The latest saved priority could not be loaded."}
            </span>
          ) : null}
          <button
            className="quiet-button"
            type="button"
            disabled={recovery.conflict && !recovery.latestReady}
            onClick={() => {
              setPriority(authoritativeTask.priority);
              setPriorityDirty(false);
              update.reset();
            }}
          >
            Use latest
          </button>
          <button className="secondary-button" type="button" onClick={() => priorityRef.current?.focus()}>
            Keep editing
          </button>
          {recovery.latestUnavailable ? (
            <button className="secondary-button" type="button" onClick={() => void recovery.refetchLatest()}>
              Refresh latest
            </button>
          ) : null}
          <button
            className="secondary-button"
            type="button"
            disabled={disabled || update.isPending || (recovery.conflict && !recovery.latestReady)}
            onClick={() => savePriority(priority, true)}
          >
            Try again
          </button>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {update.isPending ? "Saving priority" : update.isSuccess ? "Priority saved" : ""}
      </span>
      {moveOpen && task.parentTaskId === null ? (
        <TaskMoveDialog inbox={inbox} open onOpenChange={setMoveOpen} task={task} />
      ) : null}
      {tagsOpen && <TaskTagDialog disabled={disabled} open onOpenChange={setTagsOpen} task={task} />}
    </section>
  );
}

function priorityLabel(priority: TaskPriority) {
  return priority === "none" ? "None" : `${priority[0]!.toLocaleUpperCase()}${priority.slice(1)}`;
}
