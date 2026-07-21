import {
  FOCUS_BREAK_SECONDS_MAX,
  FOCUS_BREAK_SECONDS_MIN,
  FOCUS_CORRECTION_SECONDS_MAX,
  FOCUS_PLANNED_SECONDS_MAX,
  FOCUS_PLANNED_SECONDS_MIN,
  FOCUS_PLANNED_SECONDS_STEP,
  FOCUS_RECORDED_SECONDS_MAX,
  FOCUS_VERSION_MAX,
} from "./focus-limits";

export const focusKinds = ["focus", "break"] as const;
export type FocusKind = (typeof focusKinds)[number];

export const focusModes = ["pomodoro", "stopwatch"] as const;
export type FocusMode = (typeof focusModes)[number];

export const focusStates = ["active", "paused", "completed"] as const;
export type FocusState = (typeof focusStates)[number];

export type FocusStartSpec =
  | Readonly<{
      kind: "focus";
      mode: "pomodoro";
      plannedSeconds: number;
      taskId: string | null;
      habitId: string | null;
    }>
  | Readonly<{
      kind: "focus";
      mode: "stopwatch";
      plannedSeconds: null;
      taskId: string | null;
      habitId: string | null;
    }>
  | Readonly<{
      kind: "break";
      mode: "pomodoro";
      plannedSeconds: number;
      taskId: null;
      habitId: null;
    }>;

export type FocusStartSpecInput = Readonly<{
  kind: FocusKind;
  mode: FocusMode;
  plannedSeconds?: number | null;
  taskId?: string | null;
  habitId?: string | null;
}>;

export type FocusSession = Readonly<{
  id: string;
  kind: FocusKind;
  mode: FocusMode;
  state: FocusState;
  taskId: string | null;
  habitId: string | null;
  startedAt: Date;
  pausedAt: Date | null;
  accumulatedActiveSeconds: number;
  plannedSeconds: number | null;
  endedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export function normalizeFocusStartSpec(input: FocusStartSpecInput): FocusStartSpec {
  const taskId = input.taskId ?? null;
  const habitId = input.habitId ?? null;

  if (taskId !== null && habitId !== null) {
    throw new RangeError("A focus session can link to a task or a habit, not both.");
  }

  if (input.kind === "break") {
    if (input.mode !== "pomodoro") {
      throw new RangeError("A break must use Pomodoro mode.");
    }
    if (taskId !== null || habitId !== null) {
      throw new RangeError("A break cannot link to a task or habit.");
    }
    return {
      kind: "break",
      mode: "pomodoro",
      plannedSeconds: normalizePlannedSeconds(requirePlannedSeconds(input.plannedSeconds, "Break"), "break"),
      taskId: null,
      habitId: null,
    };
  }

  if (input.kind !== "focus") {
    throw new RangeError("The focus session kind is invalid.");
  }

  if (input.mode === "stopwatch") {
    if (input.plannedSeconds !== undefined && input.plannedSeconds !== null) {
      throw new RangeError("A stopwatch cannot have a planned duration.");
    }
    return { kind: "focus", mode: "stopwatch", plannedSeconds: null, taskId, habitId };
  }

  if (input.mode !== "pomodoro") {
    throw new RangeError("The focus session mode is invalid.");
  }
  return {
    kind: "focus",
    mode: "pomodoro",
    plannedSeconds: normalizePlannedSeconds(requirePlannedSeconds(input.plannedSeconds, "Focus"), "focus"),
    taskId,
    habitId,
  };
}

export function normalizePlannedSeconds(value: number, kind: FocusKind): number {
  const maximum = kind === "break" ? FOCUS_BREAK_SECONDS_MAX : FOCUS_PLANNED_SECONDS_MAX;
  const minimum = kind === "break" ? FOCUS_BREAK_SECONDS_MIN : FOCUS_PLANNED_SECONDS_MIN;
  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum ||
    value % FOCUS_PLANNED_SECONDS_STEP !== 0
  ) {
    throw new RangeError(
      `${kind === "break" ? "Break" : "Focus"} duration must be a whole-minute value from ${minimum} through ${maximum} seconds.`,
    );
  }
  return value;
}

export function assertRecordedFocusSeconds(value: number, label = "Recorded focus duration"): void {
  assertSeconds(value, FOCUS_RECORDED_SECONDS_MAX, label);
}

export function normalizeFocusCorrectionSeconds(value: number): number {
  assertSeconds(value, FOCUS_CORRECTION_SECONDS_MAX, "Corrected focus duration");
  return value;
}

export function assertFocusVersion(value: number, label = "Focus session version"): void {
  if (!Number.isInteger(value) || value < 1 || value > FOCUS_VERSION_MAX) {
    throw new RangeError(`${label} is outside the supported range.`);
  }
}

export function assertFocusSession(session: FocusSession): void {
  assertFocusVersion(session.version);
  assertRecordedFocusSeconds(session.accumulatedActiveSeconds);
  assertValidDate(session.createdAt, "Focus session creation time");
  assertValidDate(session.startedAt, "Focus session active-segment start");
  assertValidDate(session.updatedAt, "Focus session update time");
  if (session.pausedAt !== null) assertValidDate(session.pausedAt, "Focus session pause time");
  if (session.endedAt !== null) assertValidDate(session.endedAt, "Focus session end time");

  normalizeFocusStartSpec({
    kind: session.kind,
    mode: session.mode,
    plannedSeconds: session.plannedSeconds,
    taskId: session.taskId,
    habitId: session.habitId,
  });

  if (session.state === "active" && (session.pausedAt !== null || session.endedAt !== null)) {
    throw new RangeError("An active focus session cannot have a pause or end time.");
  }
  if (session.state === "paused" && (session.pausedAt === null || session.endedAt !== null)) {
    throw new RangeError("A paused focus session requires only a pause time.");
  }
  if (
    session.state === "paused" &&
    session.pausedAt !== null &&
    session.pausedAt.getTime() < session.startedAt.getTime()
  ) {
    throw new RangeError("A focus session pause cannot precede its active-segment start.");
  }
  if (session.state === "completed" && (session.pausedAt !== null || session.endedAt === null)) {
    throw new RangeError("A completed focus session requires only an end time.");
  }
  if (
    session.state === "completed" &&
    session.endedAt !== null &&
    session.endedAt.getTime() < session.startedAt.getTime()
  ) {
    throw new RangeError("A focus session end cannot precede its active-segment start.");
  }
  if (!focusStates.includes(session.state)) {
    throw new RangeError("The focus session state is invalid.");
  }
}

export function sameFocusStartSpec(session: FocusSession, spec: FocusStartSpec): boolean {
  return (
    session.kind === spec.kind &&
    session.mode === spec.mode &&
    session.plannedSeconds === spec.plannedSeconds &&
    session.taskId === spec.taskId &&
    session.habitId === spec.habitId
  );
}

export function cloneFocusSession(session: FocusSession): FocusSession {
  return {
    ...session,
    startedAt: new Date(session.startedAt),
    pausedAt: session.pausedAt === null ? null : new Date(session.pausedAt),
    endedAt: session.endedAt === null ? null : new Date(session.endedAt),
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  };
}

function assertSeconds(value: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} must be a whole number from 0 through ${maximum} seconds.`);
  }
}

function requirePlannedSeconds(value: number | null | undefined, label: string): number {
  if (value === null || value === undefined) throw new RangeError(`${label} duration is required.`);
  return value;
}

function assertValidDate(value: Date, label: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(`${label} is invalid.`);
}
