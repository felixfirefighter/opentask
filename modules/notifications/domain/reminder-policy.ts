import { REMINDER_OFFSET_MINUTES_MAX, REMINDER_OFFSET_MINUTES_MIN } from "./notification-limits";

export type ReminderPolicySpec =
  | Readonly<{ kind: "absolute"; remindAt: Date; offsetMinutes: null }>
  | Readonly<{ kind: "relative_start"; remindAt: null; offsetMinutes: number }>;

export type ReminderTaskSource = Readonly<{
  status: "open" | "completed" | "cancelled";
  deleted: boolean;
  recurring: boolean;
  relativeStart: Readonly<{ startAt: Date; occurrenceKey: string | null }> | null;
}>;

export type ReminderSuppressionCode =
  | "stale"
  | "reminder_disabled"
  | "task_deleted"
  | "task_terminal"
  | "occurrence_terminal"
  | "schedule_changed"
  | "subscription_revoked"
  | "obsolete";

export type ReminderTargetDecision =
  | Readonly<{ kind: "eligible"; scheduledFor: Date; occurrenceKey: string | null }>
  | Readonly<{ kind: "dormant"; code: ReminderSuppressionCode }>;

export function normalizeReminderSpec(spec: ReminderPolicySpec): ReminderPolicySpec {
  if (spec.kind === "absolute") {
    assertValidDate(spec.remindAt, "The reminder instant is invalid.");
    if (spec.offsetMinutes !== null) throw new Error("An absolute reminder cannot have an offset.");
    return { kind: "absolute", remindAt: new Date(spec.remindAt), offsetMinutes: null };
  }

  if (spec.remindAt !== null) throw new Error("A relative reminder cannot have an absolute instant.");
  if (
    !Number.isInteger(spec.offsetMinutes) ||
    spec.offsetMinutes < REMINDER_OFFSET_MINUTES_MIN ||
    spec.offsetMinutes > REMINDER_OFFSET_MINUTES_MAX
  ) {
    throw new RangeError("A reminder offset must be a whole number from 0 through 10,080 minutes.");
  }
  return { kind: "relative_start", remindAt: null, offsetMinutes: spec.offsetMinutes };
}

export function reminderRelativeStartThreshold(spec: ReminderPolicySpec, now: Date): Date {
  assertValidDate(now, "The authoritative reminder time is invalid.");
  const offsetMinutes = spec.kind === "relative_start" ? spec.offsetMinutes : 0;
  return new Date(now.getTime() + offsetMinutes * 60_000);
}

export function resolveReminderTarget(
  input: Readonly<{
    spec: ReminderPolicySpec;
    enabled: boolean;
    task: ReminderTaskSource;
    now: Date;
  }>,
): ReminderTargetDecision {
  const spec = normalizeReminderSpec(input.spec);
  assertValidDate(input.now, "The authoritative reminder time is invalid.");

  if (!input.enabled) return { kind: "dormant", code: "reminder_disabled" };
  if (input.task.deleted) return { kind: "dormant", code: "task_deleted" };
  if (input.task.status !== "open") return { kind: "dormant", code: "task_terminal" };

  if (spec.kind === "absolute") {
    if (input.task.recurring) return { kind: "dormant", code: "schedule_changed" };
    if (spec.remindAt.getTime() <= input.now.getTime()) return { kind: "dormant", code: "stale" };
    return { kind: "eligible", scheduledFor: spec.remindAt, occurrenceKey: null };
  }

  const source = input.task.relativeStart;
  if (!source) return { kind: "dormant", code: "schedule_changed" };
  assertValidDate(source.startAt, "The task reminder start is invalid.");
  const scheduledFor = new Date(source.startAt.getTime() - spec.offsetMinutes * 60_000);
  if (scheduledFor.getTime() <= input.now.getTime()) return { kind: "dormant", code: "stale" };
  return { kind: "eligible", scheduledFor, occurrenceKey: source.occurrenceKey };
}

export function assertReminderCanBeSet(
  input: Readonly<{
    spec: ReminderPolicySpec;
    enabled: boolean;
    task: ReminderTaskSource;
    now: Date;
    allowDormantDisable: boolean;
  }>,
): void {
  const spec = normalizeReminderSpec(input.spec);
  if (spec.kind === "absolute" && input.task.recurring) {
    throw new Error("A recurring task accepts only a reminder relative to its occurrence start.");
  }
  if (!input.enabled && input.allowDormantDisable) return;

  const decision = resolveReminderTarget({ ...input, spec });
  if (decision.kind === "eligible") return;
  throw new Error(setFailureMessage(decision.code, spec.kind));
}

export function sameReminderSpec(left: ReminderPolicySpec, right: ReminderPolicySpec): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "absolute"
    ? left.remindAt.getTime() ===
        (right as Extract<ReminderPolicySpec, { kind: "absolute" }>).remindAt.getTime()
    : left.offsetMinutes === (right as Extract<ReminderPolicySpec, { kind: "relative_start" }>).offsetMinutes;
}

function setFailureMessage(code: ReminderSuppressionCode, kind: ReminderPolicySpec["kind"]): string {
  if (code === "task_deleted") return "A deleted task cannot enable a reminder.";
  if (code === "task_terminal") return "A completed or cancelled task cannot enable a reminder.";
  if (code === "stale") return "A reminder must resolve to an instant strictly after the current time.";
  if (code === "schedule_changed" && kind === "relative_start") {
    return "This task does not have an eligible future start for a relative reminder.";
  }
  return "This reminder is not currently eligible.";
}

function assertValidDate(value: Date, message: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(message);
}
