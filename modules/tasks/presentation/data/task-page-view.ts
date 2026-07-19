import type {
  TaskListItemDto,
  TaskPage,
  TaskSearchPage,
  TaskSearchResultDto,
} from "../../application/contracts";

export function flattenTaskPages(pages: readonly TaskPage[] | undefined): TaskListItemDto[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function flattenTaskSearchPages(pages: readonly TaskSearchPage[] | undefined): TaskSearchResultDto[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function combineTerminalTasks(
  completed: readonly TaskListItemDto[],
  cancelled: readonly TaskListItemDto[],
): TaskListItemDto[] {
  return [...completed, ...cancelled].sort(compareTerminalTasks);
}

function compareTerminalTasks(left: TaskListItemDto, right: TaskListItemDto): number {
  const changedAtOrder = right.statusChangedAt.localeCompare(left.statusChangedAt);
  return changedAtOrder === 0 ? right.id.localeCompare(left.id) : changedAtOrder;
}
