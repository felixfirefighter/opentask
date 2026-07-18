export const TASK_CONTAINER_NAME_MAX_LENGTH = 120;
export const TASK_TITLE_MAX_LENGTH = 500;
export const TASK_DESCRIPTION_MAX_LENGTH = 20_000;

export type TaskTextField =
  "folderName" | "listName" | "sectionName" | "tagName" | "taskTitle" | "checklistTitle" | "descriptionMd";

export class TaskTextError extends Error {
  readonly field: TaskTextField;
  readonly reason: "BLANK" | "TOO_LONG" | "UNSAFE";

  constructor(field: TaskTextField, reason: TaskTextError["reason"]) {
    super(
      `The ${field} value is ${
        reason === "BLANK" ? "blank" : reason === "TOO_LONG" ? "too long" : "not safe to store"
      }.`,
    );
    this.name = "TaskTextError";
    this.field = field;
    this.reason = reason;
  }
}

export function normalizeFolderName(value: string): string {
  return normalizeRequiredText(value, "folderName", TASK_CONTAINER_NAME_MAX_LENGTH);
}

export function normalizeListName(value: string): string {
  return normalizeRequiredText(value, "listName", TASK_CONTAINER_NAME_MAX_LENGTH);
}

export function normalizeSectionName(value: string): string {
  return normalizeRequiredText(value, "sectionName", TASK_CONTAINER_NAME_MAX_LENGTH);
}

export function normalizeTagName(value: string): string {
  return normalizeRequiredText(value, "tagName", TASK_CONTAINER_NAME_MAX_LENGTH);
}

export function normalizeTaskTitle(value: string): string {
  return normalizeRequiredText(value, "taskTitle", TASK_TITLE_MAX_LENGTH);
}

export function normalizeChecklistTitle(value: string): string {
  return normalizeRequiredText(value, "checklistTitle", TASK_TITLE_MAX_LENGTH);
}

export function validateTaskDescription(value: string): string {
  assertDatabaseSafeTaskText(value, "descriptionMd");
  if (unicodeLength(value) > TASK_DESCRIPTION_MAX_LENGTH) {
    throw new TaskTextError("descriptionMd", "TOO_LONG");
  }
  return value;
}

function normalizeRequiredText(value: string, field: TaskTextField, maximumLength: number): string {
  assertDatabaseSafeTaskText(value, field);
  const normalized = value.normalize("NFC").trim();
  if (normalized.length === 0) throw new TaskTextError(field, "BLANK");
  if (unicodeLength(normalized) > maximumLength) throw new TaskTextError(field, "TOO_LONG");
  return normalized;
}

export function isDatabaseSafeTaskText(value: string): boolean {
  return value.isWellFormed() && !value.includes("\0");
}

function assertDatabaseSafeTaskText(value: string, field: TaskTextField): void {
  if (!isDatabaseSafeTaskText(value)) throw new TaskTextError(field, "UNSAFE");
}

function unicodeLength(value: string): number {
  return Array.from(value).length;
}
