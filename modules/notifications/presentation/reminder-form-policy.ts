import { Temporal } from "temporal-polyfill";

import type { TaskReminderDto, TaskReminderSpec } from "../application/contracts";

export type ReminderKind = TaskReminderSpec["kind"];

export type ReminderDraft = Readonly<{
  kind: ReminderKind;
  absoluteLocal: string;
  offsetMinutes: string;
  enabled: boolean;
}>;

export function createReminderDraft(
  reminder: TaskReminderDto | null,
  preferredKind: ReminderKind,
  timeZone: string,
): ReminderDraft {
  if (!reminder) {
    return {
      kind: preferredKind,
      absoluteLocal: defaultAbsoluteLocal(timeZone),
      offsetMinutes: "15",
      enabled: true,
    };
  }
  return {
    kind: reminder.spec.kind,
    absoluteLocal:
      reminder.spec.kind === "absolute"
        ? localInputForInstant(reminder.spec.remindAt, timeZone)
        : defaultAbsoluteLocal(timeZone),
    offsetMinutes: reminder.spec.kind === "relative_start" ? String(reminder.spec.offsetMinutes) : "15",
    enabled: reminder.enabled,
  };
}

export function parseReminderDraft(draft: ReminderDraft, timeZone: string) {
  if (draft.kind === "relative_start") {
    const offsetMinutes = Number(draft.offsetMinutes);
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > 10_080) {
      return { valid: false, message: "Choose a whole-minute offset from 0 through 10,080." } as const;
    }
    return {
      valid: true,
      spec: { kind: "relative_start", remindAt: null, offsetMinutes } as const,
      summary:
        offsetMinutes === 0 ? "At the eligible start" : `${offsetMinutes} minutes before the eligible start`,
    } as const;
  }

  try {
    const instant = Temporal.PlainDateTime.from(draft.absoluteLocal)
      .toZonedDateTime(timeZone, { disambiguation: "reject" })
      .toInstant();
    if (Temporal.Instant.compare(instant, Temporal.Now.instant()) <= 0) {
      return { valid: false, message: "Choose a reminder time after the current time." } as const;
    }
    return {
      valid: true,
      spec: { kind: "absolute", remindAt: instant.toString(), offsetMinutes: null } as const,
      summary: `At ${formatInstant(instant.toString(), timeZone)}`,
    } as const;
  } catch {
    return { valid: false, message: "Choose a valid local date and time." } as const;
  }
}

export function reminderSummary(reminder: TaskReminderDto, timeZone: string): string {
  return reminder.spec.kind === "absolute"
    ? `At ${formatInstant(reminder.spec.remindAt, timeZone)}`
    : reminder.spec.offsetMinutes === 0
      ? "At the eligible start"
      : `${reminder.spec.offsetMinutes} minutes before the eligible start`;
}

export function formatInstant(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(instant));
}

function defaultAbsoluteLocal(timeZone: string): string {
  const value = Temporal.Now.instant().add({ hours: 1 }).toZonedDateTimeISO(timeZone).toPlainDateTime();
  return minuteInput(value);
}

function localInputForInstant(instant: string, timeZone: string): string {
  return minuteInput(Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDateTime());
}

function minuteInput(value: Temporal.PlainDateTime): string {
  return `${value.toPlainDate().toString()}T${value.toPlainTime().toString({ smallestUnit: "minute" })}`;
}
