export const occurrenceStates = ["open", "completed", "skipped"] as const;
export type OccurrenceState = (typeof occurrenceStates)[number];

export const MAX_OCCURRENCE_TASK_VERSION = 2_147_483_647;

export type OccurrenceStateEvent = Readonly<{
  state: OccurrenceState;
  taskVersion: number;
}>;

export type OccurrenceStateDecision =
  | Readonly<{ kind: "append"; event: OccurrenceStateEvent }>
  | Readonly<{ kind: "no_op"; state: OccurrenceState }>
  | Readonly<{ kind: "replay"; event: OccurrenceStateEvent }>
  | Readonly<{ kind: "stale" }>;

export type DecideOccurrenceStateInput = Readonly<{
  currentTaskVersion: number;
  expectedVersion: number;
  targetState: OccurrenceState;
  events: readonly OccurrenceStateEvent[];
}>;

export function effectiveOccurrenceState(events: readonly OccurrenceStateEvent[]): OccurrenceState {
  return latestOccurrenceEvent(events)?.state ?? "open";
}

export function latestOccurrenceEvent(events: readonly OccurrenceStateEvent[]): OccurrenceStateEvent | null {
  let latest: OccurrenceStateEvent | null = null;
  const seenVersions = new Set<number>();
  for (const event of events) {
    assertTaskVersion(event.taskVersion, "Occurrence event task version");
    if (!occurrenceStates.includes(event.state)) throw new RangeError("Occurrence event state is invalid.");
    if (seenVersions.has(event.taskVersion)) {
      throw new RangeError("Occurrence events cannot share a task version.");
    }
    seenVersions.add(event.taskVersion);
    if (latest === null || event.taskVersion > latest.taskVersion) latest = event;
  }
  return latest;
}

export function decideOccurrenceState(input: DecideOccurrenceStateInput): OccurrenceStateDecision {
  assertTaskVersion(input.currentTaskVersion, "Current task version");
  assertTaskVersion(input.expectedVersion, "Expected task version");
  if (!occurrenceStates.includes(input.targetState))
    throw new RangeError("Occurrence target state is invalid.");

  const latest = latestOccurrenceEvent(input.events);
  if (latest !== null && latest.taskVersion > input.currentTaskVersion) {
    throw new RangeError("An occurrence event cannot be newer than its owning task.");
  }

  if (input.currentTaskVersion !== input.expectedVersion) {
    if (latest?.taskVersion === input.expectedVersion + 1 && latest.state === input.targetState) {
      return { kind: "replay", event: latest };
    }
    return { kind: "stale" };
  }

  const currentState = latest?.state ?? "open";
  if (currentState === input.targetState) return { kind: "no_op", state: currentState };
  if (input.currentTaskVersion === MAX_OCCURRENCE_TASK_VERSION) {
    throw new RangeError("The task version cannot be incremented further.");
  }
  return {
    kind: "append",
    event: { state: input.targetState, taskVersion: input.currentTaskVersion + 1 },
  };
}

function assertTaskVersion(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_OCCURRENCE_TASK_VERSION) {
    throw new RangeError(`${label} is outside the supported range.`);
  }
}
