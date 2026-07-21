export function oneOffProjectionId(taskId: string): string {
  return `task:${taskId}`;
}

export function recurringOccurrenceProjectionId(taskId: string, occurrenceKey: string): string {
  return `occurrence:${taskId}:${occurrenceKey}`;
}

export function recurrenceSummaryProjectionId(taskId: string): string {
  return `series:${taskId}`;
}
