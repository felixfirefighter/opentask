import type { InfiniteData } from "@tanstack/react-query";

import type {
  CreateTaskRequest,
  TagDto,
  TaskDto,
  TaskListItemDto,
  TaskPage,
} from "../../application/contracts";

export type TaskPageCache = InfiniteData<TaskPage, string | undefined>;

export function taskListItem(
  task: TaskDto,
  tags: TagDto[] = [],
  recurrence: TaskListItemDto["recurrence"] = null,
): TaskListItemDto {
  return { ...task, tags, recurrence };
}

export function optimisticTask(resourceId: string, input: CreateTaskRequest): TaskListItemDto {
  const now = new Date().toISOString();
  return {
    id: resourceId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    listId: input.listId,
    sectionId: input.sectionId,
    parentTaskId: input.parentTaskId,
    title: input.title,
    descriptionMd: input.descriptionMd,
    priority: input.priority,
    status: "open",
    statusChangedAt: now,
    rank: "z0",
    tags: [],
    recurrence: null,
  };
}

export function prependTask(
  data: TaskPageCache | undefined,
  task: TaskListItemDto,
): TaskPageCache | undefined {
  const withoutTask = removeTask(data, task.id);
  if (!withoutTask) return withoutTask;
  const [first, ...rest] = withoutTask.pages;
  if (!first) return withoutTask;
  return {
    ...withoutTask,
    pages: [{ ...first, items: [task, ...first.items] }, ...rest],
  };
}

export function patchTask(
  data: TaskPageCache | undefined,
  taskId: string,
  update: (task: TaskListItemDto) => TaskListItemDto,
): TaskPageCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((task) => (task.id === taskId ? update(task) : task)),
    })),
  };
}

export function removeTask(data: TaskPageCache | undefined, taskId: string): TaskPageCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((task) => task.id !== taskId),
    })),
  };
}

export function replaceTask(
  data: TaskPageCache | undefined,
  task: TaskListItemDto,
): TaskPageCache | undefined {
  return prependTask(data, task);
}

export function moveTaskInCache(
  data: TaskPageCache | undefined,
  taskId: string,
  overTaskId: string,
): TaskPageCache | undefined {
  if (!data || taskId === overTaskId) return data;
  const items = data.pages.flatMap((page) => page.items);
  const from = items.findIndex((task) => task.id === taskId);
  const to = items.findIndex((task) => task.id === overTaskId);
  if (from < 0 || to < 0) return data;
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  if (!moved) return data;
  reordered.splice(to, 0, moved);

  let offset = 0;
  return {
    ...data,
    pages: data.pages.map((page) => {
      const pageItems = reordered.slice(offset, offset + page.items.length);
      offset += page.items.length;
      return { ...page, items: pageItems };
    }),
  };
}
