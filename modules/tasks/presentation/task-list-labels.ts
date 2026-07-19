import type { TaskListItemDto, TaskStatus } from "../application/contracts";

export function terminalTaskContext(task: TaskListItemDto, timeZone: string): string {
  const label = task.status === "completed" ? "Completed" : "Cancelled";
  const date = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone }).format(
    new Date(task.statusChangedAt),
  );
  return `${label} ${date}`;
}

export function taskStatusMessage(title: string, status: TaskStatus): string {
  if (status === "open") return `${title} restored.`;
  return status === "completed"
    ? `${title} completed. Undo is available.`
    : `${title} cancelled. Undo is available.`;
}
