export type RawWorkWindow = Readonly<{
  localDate: string;
  startTime: string;
  endTime: string;
}>;

export type RawBusyInterval = Readonly<{
  semanticRef?: string;
  startAt: string;
  endAt: string;
}>;

export type RawFlexibleCandidate = Readonly<{
  kind: "flexible";
  semanticRef: string;
  durationMinutes: number;
  earliestStartAt?: string;
  deadlineAt?: string;
}>;

export type RawFixedCandidate = Readonly<{
  kind: "fixed";
  semanticRef: string;
  startAt: string;
  endAt: string;
}>;

export type RawSchedulingCandidate = RawFlexibleCandidate | RawFixedCandidate;

export type RawSchedulingInput = Readonly<{
  timeZone: string;
  workWindows: readonly RawWorkWindow[];
  busyIntervals: readonly RawBusyInterval[];
  bufferMinutes: number;
  candidates: readonly RawSchedulingCandidate[];
}>;

export type SchedulingConflictCode =
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

export type SchedulingConflict = Readonly<{
  semanticRef: string | null;
  code: SchedulingConflictCode;
}>;

export type SchedulingOverflow = Readonly<{
  semanticRef: string;
  reason: "NO_FREE_INTERVAL" | "DEADLINE_BLOCKED";
}>;

export type PlacedBlock = Readonly<{
  semanticRef: string;
  startAt: string;
  endAt: string;
}>;

export type DomainSchedulingResult = Readonly<{
  placed: readonly PlacedBlock[];
  overflow: readonly SchedulingOverflow[];
  conflicts: readonly SchedulingConflict[];
}>;

export type InstantInterval = Readonly<{
  start: bigint;
  end: bigint;
}>;

export type IndexedFixedCandidate = Readonly<{
  index: number;
  semanticRef: string;
  interval: InstantInterval;
}>;

export type IndexedFlexibleCandidate = Readonly<{
  index: number;
  semanticRef: string;
  duration: bigint;
  earliestStart: bigint | null;
  deadline: bigint | null;
}>;

export type IndexedPlacement = Readonly<{
  index: number;
  semanticRef: string;
  interval: InstantInterval;
}>;
