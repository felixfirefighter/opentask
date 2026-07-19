import { taskListItemDtoSchema, type TaskListItemDto } from "./contracts";
import { mapTag, mapTask } from "./task-application-support";
import type { StoredTask } from "../infrastructure/task-repository";
import type { StoredTaskTag } from "../infrastructure/tag-repository";

export function mapTaskListItems(
  tasks: readonly StoredTask[],
  attachedTags: readonly StoredTaskTag[],
): TaskListItemDto[] {
  const tagsByTask = new Map<string, StoredTaskTag["tag"][]>();
  for (const { taskId, tag } of attachedTags) {
    const tags = tagsByTask.get(taskId) ?? [];
    tags.push(tag);
    tagsByTask.set(taskId, tags);
  }
  return tasks.map((task) =>
    taskListItemDtoSchema.parse({
      ...mapTask(task),
      tags: (tagsByTask.get(task.id) ?? []).map(mapTag),
    }),
  );
}
