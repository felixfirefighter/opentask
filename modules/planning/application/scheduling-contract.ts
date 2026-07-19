export type SchedulingWorkWindow = Readonly<{
  localDate: string;
  startTime: string;
  endTime: string;
}>;

export type BusyInterval = Readonly<{
  semanticRef?: string;
  startAt: string;
  endAt: string;
}>;

export type FlexibleSchedulingCandidate = Readonly<{
  kind: "flexible";
  semanticRef: string;
  durationMinutes: number;
  earliestStartAt?: string;
  deadlineAt?: string;
}>;

export type FixedSchedulingCandidate = Readonly<{
  kind: "fixed";
  semanticRef: string;
  startAt: string;
  endAt: string;
}>;

export type SchedulingCandidate = FlexibleSchedulingCandidate | FixedSchedulingCandidate;

export type SchedulingInput = Readonly<{
  timeZone: string;
  workWindows: readonly SchedulingWorkWindow[];
  busyIntervals: readonly BusyInterval[];
  bufferMinutes: number;
  candidates: readonly SchedulingCandidate[];
}>;

export type SchedulingOverflowReason = "NO_FREE_INTERVAL" | "DEADLINE_BLOCKED";

export type SchedulingConflictCode =
  | "INVALID_TIME_ZONE"
  | "INVALID_WORK_WINDOW"
  | "OVERLAPPING_WORK_WINDOWS"
  | "INVALID_BUSY_INTERVAL"
  | "INVALID_SEMANTIC_REF"
  | "DUPLICATE_SEMANTIC_REF"
  | "INVALID_DURATION"
  | "INVALID_CONSTRAINT"
  | "IMPOSSIBLE_CONSTRAINTS"
  | "FIXED_OUTSIDE_WORK_WINDOW"
  | "FIXED_OVERLAP"
  | "FIXED_BUFFER_CONFLICT";

export type ScheduledBlock = Readonly<{
  semanticRef: string;
  startAt: string;
  endAt: string;
}>;

export type SchedulingOverflow = Readonly<{
  semanticRef: string;
  reason: SchedulingOverflowReason;
}>;

export type SchedulingConflict = Readonly<{
  semanticRef: string | null;
  code: SchedulingConflictCode;
}>;

export type SchedulingResult = Readonly<{
  placed: readonly ScheduledBlock[];
  overflow: readonly SchedulingOverflow[];
  conflicts: readonly SchedulingConflict[];
}>;
