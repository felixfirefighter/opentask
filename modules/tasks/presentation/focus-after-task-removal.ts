import type { TaskListItemDto } from "../application/contracts";

export function focusAfterTaskRemoval(taskId: string, tasks: readonly TaskListItemDto[]) {
  const index = tasks.findIndex((task) => task.id === taskId);
  const candidate = tasks[index + 1] ?? tasks[index - 1];
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const safeId = candidate ? (globalThis.CSS?.escape(candidate.id) ?? candidate.id) : null;
      const target = safeId
        ? document.querySelector<HTMLElement>(`[data-task-id="${safeId}"] a`)
        : document.getElementById("task-workspace-heading");
      target?.focus();
    }),
  );
}

export function focusTaskRow(taskId: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const safeId = globalThis.CSS?.escape(taskId) ?? taskId;
      document.querySelector<HTMLElement>(`[data-task-id="${safeId}"] a`)?.focus();
    }),
  );
}
