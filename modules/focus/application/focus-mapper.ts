import {
  focusSessionDtoSchema,
  focusTimerSnapshotSchema,
  type FocusResolvedLink,
  type FocusSessionDto,
  type FocusTimerSnapshot,
} from "./contracts";
import { reconstructFocusTimer } from "../domain/focus-timer-policy";
import { assertFocusSession, type FocusSession } from "../domain/focus-session-policy";
import type { StoredFocusSession } from "../infrastructure/focus-session-repository";

export function storedFocusSession(row: StoredFocusSession): FocusSession {
  const parsed = focusSessionDtoSchema.parse({
    id: row.id,
    kind: row.kind,
    mode: row.mode,
    state: row.state,
    taskId: row.taskId,
    habitId: row.habitId,
    startedAt: row.startedAt.toISOString(),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    accumulatedActiveSeconds: row.accumulatedActiveSeconds,
    plannedSeconds: row.plannedSeconds,
    endedAt: row.endedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
  const session: FocusSession = {
    ...parsed,
    startedAt: new Date(parsed.startedAt),
    pausedAt: parsed.pausedAt === null ? null : new Date(parsed.pausedAt),
    endedAt: parsed.endedAt === null ? null : new Date(parsed.endedAt),
    createdAt: new Date(parsed.createdAt),
    updatedAt: new Date(parsed.updatedAt),
  };
  assertFocusSession(session);
  return session;
}

export function mapFocusSession(session: FocusSession): FocusSessionDto {
  return focusSessionDtoSchema.parse({
    ...session,
    startedAt: session.startedAt.toISOString(),
    pausedAt: session.pausedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
}

export function mapFocusTimerSnapshot(
  session: FocusSession,
  authoritativeAt: Date,
  link: FocusResolvedLink | null,
): FocusTimerSnapshot {
  const reading = reconstructFocusTimer(session, authoritativeAt);
  return focusTimerSnapshotSchema.parse({
    session: mapFocusSession(session),
    link,
    authoritativeAt: reading.authoritativeAt.toISOString(),
    elapsedActiveSeconds: reading.elapsedActiveSeconds,
    remainingSeconds: reading.remainingSeconds,
    overtimeSeconds: reading.overtimeSeconds,
    planReached: reading.planReached,
  });
}
