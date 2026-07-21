import { z } from "zod";

import { FOCUS_RECORDED_SECONDS_MAX } from "../../domain/focus-limits";
import { normalizeFocusStartSpec } from "../../domain/focus-session-policy";
import {
  focusBreakSecondsSchema,
  focusCorrectionSecondsSchema,
  focusExpectedVersionRequestSchema,
  focusIdSchema,
  focusInstantSchema,
  focusPlannedSecondsSchema,
  focusRecordedSecondsSchema,
  focusVersionSchema,
} from "./focus-contract-primitives";
import { focusResolvedLinkSchema } from "./focus-link-validator";

const nullableLinkFields = {
  taskId: focusIdSchema.nullable().optional().default(null),
  habitId: focusIdSchema.nullable().optional().default(null),
};

const focusPomodoroStartFields = {
  kind: z.literal("focus"),
  mode: z.literal("pomodoro"),
  plannedSeconds: focusPlannedSecondsSchema,
  ...nullableLinkFields,
} as const;

const focusStopwatchStartFields = {
  kind: z.literal("focus"),
  mode: z.literal("stopwatch"),
  plannedSeconds: z.null().optional().default(null),
  ...nullableLinkFields,
} as const;

const focusBreakStartFields = {
  kind: z.literal("break"),
  mode: z.literal("pomodoro"),
  plannedSeconds: focusBreakSecondsSchema,
  taskId: z.null().optional().default(null),
  habitId: z.null().optional().default(null),
} as const;

const focusPomodoroStartSchema = z
  .strictObject({
    id: focusIdSchema,
    ...focusPomodoroStartFields,
  })
  .superRefine(refineSingleLink);

const focusStopwatchStartSchema = z
  .strictObject({
    id: focusIdSchema,
    ...focusStopwatchStartFields,
  })
  .superRefine(refineSingleLink);

const focusBreakStartSchema = z.strictObject({ id: focusIdSchema, ...focusBreakStartFields });

export const focusStartRequestSchema = z.union([
  z.strictObject(focusPomodoroStartFields).superRefine(refineSingleLink),
  z.strictObject(focusStopwatchStartFields).superRefine(refineSingleLink),
  z.strictObject(focusBreakStartFields),
]);

export const focusStartInputSchema = z.union([
  focusPomodoroStartSchema,
  focusStopwatchStartSchema,
  focusBreakStartSchema,
]);

export const focusSessionDtoSchema = z
  .strictObject({
    id: focusIdSchema,
    kind: z.enum(["focus", "break"]),
    mode: z.enum(["pomodoro", "stopwatch"]),
    state: z.enum(["active", "paused", "completed"]),
    taskId: focusIdSchema.nullable(),
    habitId: focusIdSchema.nullable(),
    startedAt: focusInstantSchema,
    pausedAt: focusInstantSchema.nullable(),
    accumulatedActiveSeconds: focusRecordedSecondsSchema,
    plannedSeconds: z.number().int().positive().max(FOCUS_RECORDED_SECONDS_MAX).nullable(),
    endedAt: focusInstantSchema.nullable(),
    version: focusVersionSchema,
    createdAt: focusInstantSchema,
    updatedAt: focusInstantSchema,
  })
  .superRefine((session, context) => {
    try {
      normalizeFocusStartSpec(session);
    } catch (error) {
      addIssue(context, error);
    }

    if (session.state === "active" && (session.pausedAt !== null || session.endedAt !== null)) {
      context.addIssue({ code: "custom", message: "An active session cannot have a pause or end time." });
    }
    if (session.state === "paused" && (session.pausedAt === null || session.endedAt !== null)) {
      context.addIssue({ code: "custom", message: "A paused session requires only a pause time." });
    }
    if (
      session.state === "paused" &&
      session.pausedAt !== null &&
      Date.parse(session.pausedAt) < Date.parse(session.startedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pausedAt"],
        message: "A session pause cannot precede its active-segment start.",
      });
    }
    if (session.state === "completed" && (session.pausedAt !== null || session.endedAt === null)) {
      context.addIssue({ code: "custom", message: "A completed session requires only an end time." });
    }
    if (
      session.state === "completed" &&
      session.endedAt !== null &&
      Date.parse(session.endedAt) < Date.parse(session.startedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "A session end cannot precede its active-segment start.",
      });
    }
  });

export const focusTimerSnapshotSchema = z
  .strictObject({
    session: focusSessionDtoSchema,
    link: focusResolvedLinkSchema.nullable(),
    authoritativeAt: focusInstantSchema,
    elapsedActiveSeconds: focusRecordedSecondsSchema,
    remainingSeconds: focusRecordedSecondsSchema.nullable(),
    overtimeSeconds: focusRecordedSecondsSchema,
    planReached: z.boolean(),
  })
  .superRefine((snapshot, context) => {
    const expectedLink = snapshot.session.taskId
      ? { kind: "task", id: snapshot.session.taskId }
      : snapshot.session.habitId
        ? { kind: "habit", id: snapshot.session.habitId }
        : null;
    if (
      (expectedLink === null && snapshot.link !== null) ||
      (expectedLink !== null &&
        (snapshot.link === null ||
          snapshot.link.kind !== expectedLink.kind ||
          snapshot.link.id !== expectedLink.id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["link"],
        message: "The hydrated timer link does not match its focus session.",
      });
    }
    const planned = snapshot.session.plannedSeconds;
    const expectedRemaining = planned === null ? null : Math.max(planned - snapshot.elapsedActiveSeconds, 0);
    const expectedOvertime = planned === null ? 0 : Math.max(snapshot.elapsedActiveSeconds - planned, 0);
    if (snapshot.remainingSeconds !== expectedRemaining) {
      context.addIssue({ code: "custom", path: ["remainingSeconds"], message: "Remaining time is invalid." });
    }
    if (snapshot.overtimeSeconds !== expectedOvertime) {
      context.addIssue({ code: "custom", path: ["overtimeSeconds"], message: "Overtime is invalid." });
    }
    if (snapshot.planReached !== (planned !== null && snapshot.elapsedActiveSeconds >= planned)) {
      context.addIssue({ code: "custom", path: ["planReached"], message: "Plan state is invalid." });
    }
  });

export const focusStartResultSchema = z.strictObject({
  outcome: z.enum(["created", "idempotent_retry", "recovered_existing"]),
  snapshot: focusTimerSnapshotSchema,
});

export const focusTransitionRequestSchema = focusExpectedVersionRequestSchema;
export const discardFocusSessionRequestSchema = focusExpectedVersionRequestSchema;
export const deleteCompletedSessionRequestSchema = focusExpectedVersionRequestSchema;

export const focusLinkSelectionSchema = z.union([
  z.null(),
  z.strictObject({ kind: z.literal("task"), id: focusIdSchema }),
  z.strictObject({ kind: z.literal("habit"), id: focusIdSchema }),
]);

const completedSessionPatchSchema = z
  .strictObject({
    durationSeconds: focusCorrectionSecondsSchema.optional(),
    link: focusLinkSelectionSchema.optional(),
  })
  .refine(
    (patch) => patch.durationSeconds !== undefined || patch.link !== undefined,
    "A correction must change duration or link.",
  );

export const correctCompletedSessionRequestSchema = z.strictObject({
  expectedVersion: focusVersionSchema,
  patch: completedSessionPatchSchema,
});

export type CorrectCompletedSessionRequest = z.infer<typeof correctCompletedSessionRequestSchema>;
export type FocusLinkSelection = z.infer<typeof focusLinkSelectionSchema>;
export type FocusSessionDto = z.infer<typeof focusSessionDtoSchema>;
export type FocusStartInput = z.infer<typeof focusStartInputSchema>;
export type FocusStartRequest = z.infer<typeof focusStartRequestSchema>;
export type FocusStartResult = z.infer<typeof focusStartResultSchema>;
export type FocusTimerSnapshot = z.infer<typeof focusTimerSnapshotSchema>;
export type FocusTransitionRequest = z.infer<typeof focusTransitionRequestSchema>;

function refineSingleLink(
  value: Readonly<{ taskId: string | null; habitId: string | null }>,
  context: z.RefinementCtx,
): void {
  if (value.taskId !== null && value.habitId !== null) {
    context.addIssue({
      code: "custom",
      message: "A focus session can link to a task or a habit, not both.",
    });
  }
}

function addIssue(context: z.RefinementCtx, error: unknown): void {
  context.addIssue({
    code: "custom",
    message: error instanceof Error ? error.message : "The focus session is invalid.",
  });
}
