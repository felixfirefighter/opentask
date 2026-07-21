import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  correctCompletedSessionRequestSchema,
  deleteCompletedSessionRequestSchema,
  discardFocusSessionRequestSchema,
  focusIdSchema,
  focusStartInputSchema,
  focusTransitionRequestSchema,
  type CorrectCompletedSessionRequest,
  type FocusLinkValidators,
  type FocusSessionDto,
  type FocusStartInput,
  type FocusStartResult,
  type FocusTimerSnapshot,
  type FocusTransitionRequest,
} from "./contracts";
import { focusConflict, focusNotFound, staleFocus } from "./focus-errors";
import {
  assertSelectableCorrectionLink,
  assertSelectableStartLink,
  focusLinkSelectionMatches,
  resolveFocusSessionLink,
} from "./focus-link-validation";
import { mapFocusSession, mapFocusTimerSnapshot, storedFocusSession } from "./focus-mapper";
import { decideFocusCorrection } from "../domain/focus-correction-policy";
import { decideCompletedFocusDeletion, decideFocusDiscard } from "../domain/focus-removal-policy";
import { decideFocusStart } from "../domain/focus-start-policy";
import { decideFocusTransition, type FocusTransitionCommand } from "../domain/focus-transition-policy";
import { createFocusSessionRepository } from "../infrastructure/focus-session-repository";

type FocusSessionRepository = ReturnType<typeof createFocusSessionRepository>;
export type FocusSessionApplicationRepository = Pick<
  FocusSessionRepository,
  "lockStartScope" | "lockById" | "findUnfinished" | "insert" | "writeState" | "correctCompleted" | "remove"
>;

export function createFocusSessionApplication({
  database,
  clock,
  links,
  sessions = createFocusSessionRepository(database),
}: Readonly<{
  database: Database;
  clock: Clock;
  links: FocusLinkValidators;
  sessions?: FocusSessionApplicationRepository;
}>) {
  async function startFocusSession(
    actor: AuthenticatedActor,
    rawInput: FocusStartInput,
  ): Promise<FocusStartResult> {
    const input = focusStartInputSchema.parse(rawInput);

    return database.transaction(async (transaction) => {
      await sessions.lockStartScope(actor.userId, transaction);
      const authoritativeAt = clock.now();
      const existingById = await sessions.lockById(actor.userId, input.id, transaction);
      const unfinished =
        existingById !== null && existingById.state !== "completed"
          ? null
          : await sessions.findUnfinished(actor.userId, transaction, true);
      const decision = decideFocusStart({
        id: input.id,
        spec: input,
        existingById: existingById ? storedFocusSession(existingById) : null,
        unfinishedSession: unfinished ? storedFocusSession(unfinished) : null,
        now: authoritativeAt,
      });

      if (decision.kind === "conflict") {
        throw focusConflict(
          "This focus session identifier was already used for a different timer.",
          existingById?.version,
        );
      }
      if (decision.kind === "replay") {
        const link = await resolveFocusSessionLink(actor, decision.session, links, transaction);
        return {
          outcome: "idempotent_retry",
          snapshot: mapFocusTimerSnapshot(decision.session, authoritativeAt, link),
        };
      }
      if (decision.kind === "recover") {
        const link = await resolveFocusSessionLink(actor, decision.session, links, transaction);
        return {
          outcome: "recovered_existing",
          snapshot: mapFocusTimerSnapshot(decision.session, authoritativeAt, link),
        };
      }

      const link = await assertSelectableStartLink(actor, input, links, transaction);
      const created = await sessions.insert(
        {
          id: decision.session.id,
          userId: actor.userId,
          taskId: decision.session.taskId,
          habitId: decision.session.habitId,
          kind: decision.session.kind,
          mode: decision.session.mode,
          plannedSeconds: decision.session.plannedSeconds,
          now: authoritativeAt,
        },
        transaction,
      );
      if (!created) {
        throw focusConflict("This focus session identifier could not be reserved safely.");
      }
      return {
        outcome: "created",
        snapshot: mapFocusTimerSnapshot(storedFocusSession(created), authoritativeAt, link),
      };
    });
  }

  async function transitionFocusSession(
    actor: AuthenticatedActor,
    rawSessionId: string,
    rawInput: FocusTransitionRequest,
    command: FocusTransitionCommand,
  ): Promise<FocusTimerSnapshot> {
    const sessionId = focusIdSchema.parse(rawSessionId);
    const input = focusTransitionRequestSchema.parse(rawInput);

    return database.transaction(async (transaction) => {
      const row = await sessions.lockById(actor.userId, sessionId, transaction);
      if (!row) throw focusNotFound();
      const authoritativeAt = clock.now();
      const decision = decideFocusTransition({
        session: storedFocusSession(row),
        command,
        expectedVersion: input.expectedVersion,
        now: authoritativeAt,
      });

      if (decision.kind === "stale") throw staleFocus(row.version);
      if (decision.kind === "closed") {
        throw focusConflict(`This focus session cannot ${command} from its current state.`, row.version);
      }
      if (decision.kind === "replay") {
        const link = await resolveFocusSessionLink(actor, decision.session, links, transaction);
        return mapFocusTimerSnapshot(decision.session, authoritativeAt, link);
      }

      const written = await sessions.writeState(
        {
          userId: actor.userId,
          id: sessionId,
          expectedVersion: input.expectedVersion,
          value: {
            state: decision.session.state,
            startedAt: decision.session.startedAt,
            pausedAt: decision.session.pausedAt,
            accumulatedActiveSeconds: decision.session.accumulatedActiveSeconds,
            endedAt: decision.session.endedAt,
          },
          now: authoritativeAt,
        },
        transaction,
      );
      if (!written) throw focusConflict("The focus transition could not be saved safely.", row.version);
      const saved = storedFocusSession(written);
      const link = await resolveFocusSessionLink(actor, saved, links, transaction);
      return mapFocusTimerSnapshot(saved, authoritativeAt, link);
    });
  }

  return {
    startFocusSession,

    pauseFocusSession(
      actor: AuthenticatedActor,
      sessionId: string,
      input: FocusTransitionRequest,
    ): Promise<FocusTimerSnapshot> {
      return transitionFocusSession(actor, sessionId, input, "pause");
    },

    resumeFocusSession(
      actor: AuthenticatedActor,
      sessionId: string,
      input: FocusTransitionRequest,
    ): Promise<FocusTimerSnapshot> {
      return transitionFocusSession(actor, sessionId, input, "resume");
    },

    finishFocusSession(
      actor: AuthenticatedActor,
      sessionId: string,
      input: FocusTransitionRequest,
    ): Promise<FocusTimerSnapshot> {
      return transitionFocusSession(actor, sessionId, input, "finish");
    },

    async discardFocusSession(
      actor: AuthenticatedActor,
      rawSessionId: string,
      rawInput: FocusTransitionRequest,
    ): Promise<FocusSessionDto> {
      const sessionId = focusIdSchema.parse(rawSessionId);
      const input = discardFocusSessionRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const row = await sessions.lockById(actor.userId, sessionId, transaction);
        if (!row) throw focusNotFound();
        const current = storedFocusSession(row);
        const decision = decideFocusDiscard(current, input.expectedVersion);
        if (decision.kind === "stale") throw staleFocus(row.version);
        if (decision.kind === "closed") {
          throw focusConflict("Only an unfinished focus session can be discarded.", row.version);
        }
        const removed = await sessions.remove(
          {
            userId: actor.userId,
            id: sessionId,
            expectedVersion: input.expectedVersion,
            lifecycle: "unfinished",
          },
          transaction,
        );
        if (!removed) throw focusConflict("The focus session could not be discarded safely.", row.version);
        return mapFocusSession(storedFocusSession(removed));
      });
    },

    async correctCompletedSession(
      actor: AuthenticatedActor,
      rawSessionId: string,
      rawInput: CorrectCompletedSessionRequest,
    ): Promise<FocusSessionDto> {
      const sessionId = focusIdSchema.parse(rawSessionId);
      const input = correctCompletedSessionRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const row = await sessions.lockById(actor.userId, sessionId, transaction);
        if (!row) throw focusNotFound();
        const authoritativeAt = clock.now();
        const current = storedFocusSession(row);
        const decision = decideFocusCorrection({
          session: current,
          expectedVersion: input.expectedVersion,
          correction: input.patch,
          now: authoritativeAt,
        });
        if (decision.kind === "stale") throw staleFocus(row.version);
        if (decision.kind === "closed") {
          throw focusConflict("Only a completed focus session can be corrected.", row.version);
        }
        if (decision.kind === "replay" || decision.kind === "no_op") {
          return mapFocusSession(decision.session);
        }

        if (input.patch.link !== undefined && !focusLinkSelectionMatches(current, input.patch.link)) {
          await assertSelectableCorrectionLink(actor, input.patch.link, links, transaction);
        }
        const written = await sessions.correctCompleted(
          {
            userId: actor.userId,
            id: sessionId,
            expectedVersion: input.expectedVersion,
            accumulatedActiveSeconds: decision.session.accumulatedActiveSeconds,
            taskId: decision.session.taskId,
            habitId: decision.session.habitId,
            now: authoritativeAt,
          },
          transaction,
        );
        if (!written) throw focusConflict("The focus correction could not be saved safely.", row.version);
        return mapFocusSession(storedFocusSession(written));
      });
    },

    async deleteCompletedSession(
      actor: AuthenticatedActor,
      rawSessionId: string,
      rawInput: FocusTransitionRequest,
    ): Promise<FocusSessionDto> {
      const sessionId = focusIdSchema.parse(rawSessionId);
      const input = deleteCompletedSessionRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const row = await sessions.lockById(actor.userId, sessionId, transaction);
        if (!row) throw focusNotFound();
        const current = storedFocusSession(row);
        const decision = decideCompletedFocusDeletion(current, input.expectedVersion);
        if (decision.kind === "stale") throw staleFocus(row.version);
        if (decision.kind === "closed") {
          throw focusConflict("Only a completed focus session can be deleted.", row.version);
        }
        const removed = await sessions.remove(
          {
            userId: actor.userId,
            id: sessionId,
            expectedVersion: input.expectedVersion,
            lifecycle: "completed-focus",
          },
          transaction,
        );
        if (!removed) throw focusConflict("The focus session could not be deleted safely.", row.version);
        return mapFocusSession(storedFocusSession(removed));
      });
    },
  } as const;
}

export type FocusSessionApplication = ReturnType<typeof createFocusSessionApplication>;
