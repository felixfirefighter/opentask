import type { TaskReminderDto, TaskReminderSpec } from "./contracts";
import type { TaskReminderRecord } from "./notification-records";
import type { ReminderPolicySpec } from "../domain/reminder-policy";

export function mapTaskReminder(record: TaskReminderRecord): TaskReminderDto {
  return {
    id: record.id,
    taskId: record.taskId,
    enabled: record.enabled,
    version: record.version,
    spec:
      record.kind === "absolute"
        ? { kind: "absolute", remindAt: requireDate(record.remindAt).toISOString(), offsetMinutes: null }
        : {
            kind: "relative_start",
            remindAt: null,
            offsetMinutes: requireOffset(record.offsetMinutes),
          },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toReminderPolicySpec(spec: TaskReminderSpec): ReminderPolicySpec {
  return spec.kind === "absolute"
    ? { kind: "absolute", remindAt: new Date(spec.remindAt), offsetMinutes: null }
    : { kind: "relative_start", remindAt: null, offsetMinutes: spec.offsetMinutes };
}

export function storedReminderPolicySpec(record: TaskReminderRecord): ReminderPolicySpec {
  return record.kind === "absolute"
    ? { kind: "absolute", remindAt: requireDate(record.remindAt), offsetMinutes: null }
    : { kind: "relative_start", remindAt: null, offsetMinutes: requireOffset(record.offsetMinutes) };
}

function requireDate(value: Date | null): Date {
  if (!value) throw new Error("An absolute reminder row is missing its required instant.");
  return value;
}

function requireOffset(value: number | null): number {
  if (value === null) throw new Error("A relative reminder row is missing its required offset.");
  return value;
}
