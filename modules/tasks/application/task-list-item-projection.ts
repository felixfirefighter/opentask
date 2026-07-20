import { taskListItemDtoSchema, type TaskListItemDto } from "./contracts";
import { mapTag, mapTask } from "./task-application-support";
import type { StoredTask } from "../infrastructure/task-repository";
import type { StoredTaskRecurrence } from "../infrastructure/task-recurrence-repository";
import type { StoredTaskTag } from "../infrastructure/tag-repository";

export function mapTaskListItems(
  tasks: readonly StoredTask[],
  attachedTags: readonly StoredTaskTag[],
  recurrences: readonly StoredTaskRecurrence[],
): TaskListItemDto[] {
  const tagsByTask = new Map<string, StoredTaskTag["tag"][]>();
  for (const { taskId, tag } of attachedTags) {
    const tags = tagsByTask.get(taskId) ?? [];
    tags.push(tag);
    tagsByTask.set(taskId, tags);
  }
  const recurrenceByTask = new Map(recurrences.map((recurrence) => [recurrence.taskId, recurrence]));
  return tasks.map((task) =>
    taskListItemDtoSchema.parse({
      ...mapTask(task),
      tags: (tagsByTask.get(task.id) ?? []).map(mapTag),
      recurrence: mapListRecurrence(recurrenceByTask.get(task.id)),
    }),
  );
}

function mapListRecurrence(recurrence: StoredTaskRecurrence | undefined) {
  if (!recurrence) return null;
  return {
    status:
      recurrence.projectionEndDate !== null || recurrence.projectionEndAt !== null
        ? ("ended" as const)
        : ("active" as const),
  };
}
