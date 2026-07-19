import { z } from "zod";
import { Temporal } from "temporal-polyfill";

import {
  PLANNER_SCHEMA_VERSION,
  entityIdSchema,
  instantSchema,
  localDateSchema,
  newSemanticRefSchema,
  rationaleSchema,
  semanticRefSchema,
  selectedSemanticRefSchema,
  summarySchema,
  taskDescriptionSchema,
  taskPrioritySchema,
  taskTitleSchema,
  timeZoneSchema,
  uncertaintySchema,
  versionSchema,
} from "./contract-primitives";

const actionBase = {
  actionId: entityIdSchema,
  rationale: rationaleSchema,
  uncertainties: z.array(uncertaintySchema).max(10),
} as const;

const allDayScheduleSchema = z
  .strictObject({
    kind: z.literal("all_day"),
    startDate: localDateSchema,
    endDate: localDateSchema,
  })
  .refine((schedule) => schedule.startDate < schedule.endDate, {
    path: ["endDate"],
    message: "An all-day schedule uses an exclusive end date after its start date.",
  });

const timedScheduleSchema = z
  .strictObject({
    kind: z.literal("timed"),
    startAt: instantSchema,
    endAt: instantSchema,
    timeZone: timeZoneSchema,
  })
  .refine((schedule) => isNondecreasingInstantRange(schedule.startAt, schedule.endAt), {
    path: ["endAt"],
    message: "A timed schedule cannot end before it starts.",
  });

export const plannerScheduleSchema = z.discriminatedUnion("kind", [
  allDayScheduleSchema,
  timedScheduleSchema,
]);

const createActionSchema = z.strictObject({
  ...actionBase,
  kind: z.literal("create"),
  semanticRef: newSemanticRefSchema,
  after: z.strictObject({
    title: taskTitleSchema,
    descriptionMd: taskDescriptionSchema,
    priority: taskPrioritySchema,
    schedule: plannerScheduleSchema.nullable(),
  }),
});

const updateActionSchema = z
  .strictObject({
    ...actionBase,
    kind: z.literal("update"),
    semanticRef: selectedSemanticRefSchema,
    taskId: entityIdSchema,
    before: z.strictObject({ title: taskTitleSchema, descriptionMd: taskDescriptionSchema }),
    after: z.strictObject({ title: taskTitleSchema, descriptionMd: taskDescriptionSchema }),
  })
  .refine(
    (action) =>
      action.before.title !== action.after.title ||
      action.before.descriptionMd !== action.after.descriptionMd,
    { path: ["after"], message: "An update action must change title or description." },
  );

const prioritizeActionSchema = z
  .strictObject({
    ...actionBase,
    kind: z.literal("prioritize"),
    semanticRef: selectedSemanticRefSchema,
    taskId: entityIdSchema,
    before: taskPrioritySchema,
    after: taskPrioritySchema,
  })
  .refine((action) => action.before !== action.after, {
    path: ["after"],
    message: "A prioritize action must change priority.",
  });

const scheduleActionSchema = z
  .strictObject({
    ...actionBase,
    kind: z.literal("schedule"),
    semanticRef: selectedSemanticRefSchema,
    taskId: entityIdSchema,
    before: plannerScheduleSchema.nullable(),
    after: plannerScheduleSchema,
  })
  .refine((action) => JSON.stringify(action.before) !== JSON.stringify(action.after), {
    path: ["after"],
    message: "A schedule action must change the schedule.",
  });

const deferActionSchema = z
  .strictObject({
    ...actionBase,
    kind: z.literal("defer"),
    semanticRef: semanticRefSchema,
    taskId: entityIdSchema.nullable(),
  })
  .superRefine((action, context) => {
    const selectedTask = action.semanticRef.startsWith("selected-");
    if ((selectedTask && action.taskId === null) || (!selectedTask && action.taskId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["taskId"],
        message: "Defer targets must match their selected or new semantic reference.",
      });
    }
  });

export const plannerActionSchema = z.discriminatedUnion("kind", [
  createActionSchema,
  updateActionSchema,
  prioritizeActionSchema,
  scheduleActionSchema,
  deferActionSchema,
]);

const overflowSchema = z.strictObject({
  semanticRef: semanticRefSchema,
  reason: z.enum(["NO_FREE_INTERVAL", "DEADLINE_BLOCKED"]),
});

const conflictSchema = z.strictObject({
  semanticRef: semanticRefSchema.nullable(),
  code: z.enum([
    "INVALID_TIME_ZONE",
    "INVALID_WORK_WINDOW",
    "OVERLAPPING_WORK_WINDOWS",
    "INVALID_BUSY_INTERVAL",
    "INVALID_SEMANTIC_REF",
    "DUPLICATE_SEMANTIC_REF",
    "INVALID_DURATION",
    "INVALID_CONSTRAINT",
    "IMPOSSIBLE_CONSTRAINTS",
    "FIXED_OUTSIDE_WORK_WINDOW",
    "FIXED_OVERLAP",
    "FIXED_BUFFER_CONFLICT",
  ]),
});

export const plannerProposalSchema = z
  .strictObject({
    schemaVersion: z.literal(PLANNER_SCHEMA_VERSION),
    planningDate: localDateSchema,
    summary: summarySchema,
    actions: z.array(plannerActionSchema).max(200),
    overflow: z.array(overflowSchema).max(100),
    conflicts: z.array(conflictSchema).max(100),
    uncertainties: z.array(uncertaintySchema).max(20),
  })
  .superRefine((proposal, context) => {
    const actionIds = proposal.actions.map(({ actionId }) => actionId);
    if (new Set(actionIds).size !== actionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Planner action IDs must be unique.",
      });
    }

    const actionKinds = proposal.actions.map(({ kind, semanticRef }) => `${semanticRef}:${kind}`);
    if (new Set(actionKinds).size !== actionKinds.length) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "A semantic reference cannot repeat an action kind.",
      });
    }

    const deferredReferences = new Set(
      proposal.actions.filter(({ kind }) => kind === "defer").map(({ semanticRef }) => semanticRef),
    );
    if (
      proposal.actions.some(
        ({ kind, semanticRef }) => kind !== "defer" && deferredReferences.has(semanticRef),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "A deferred semantic reference cannot have another action.",
      });
    }

    const overflowReferences = proposal.overflow.map(({ semanticRef }) => semanticRef);
    if (new Set(overflowReferences).size !== overflowReferences.length) {
      context.addIssue({
        code: "custom",
        path: ["overflow"],
        message: "Overflow references must be unique.",
      });
    }
  });

export const proposalContextVersionsSchema = z
  .record(
    z.uuidv4().refine((value) => value === value.toLowerCase(), {
      message: "Context version IDs must use canonical lowercase UUIDs.",
    }),
    versionSchema,
  )
  .refine((versions) => Object.keys(versions).length <= 100, {
    message: "A proposal cannot track more than 100 task versions.",
  });

export const plannerProposalStatusSchema = z.enum(["pending", "applied", "expired", "rejected"]);

export const plannerProposalDtoSchema = z.strictObject({
  id: entityIdSchema,
  planningDate: localDateSchema,
  schemaVersion: z.literal(PLANNER_SCHEMA_VERSION),
  proposal: plannerProposalSchema,
  contextVersions: proposalContextVersionsSchema,
  status: plannerProposalStatusSchema,
  model: z.string().trim().min(1).max(100),
  promptVersion: z.string().trim().min(1).max(100),
  applyToken: entityIdSchema,
  createdAt: instantSchema,
  expiresAt: instantSchema,
  appliedAt: instantSchema.nullable(),
});

export const plannerSelectionSchema = z
  .strictObject({
    proposalId: entityIdSchema,
    applyToken: entityIdSchema,
    actions: z.array(plannerActionSchema).max(200),
  })
  .superRefine((selection, context) => {
    const actionIds = selection.actions.map(({ actionId }) => actionId);
    if (new Set(actionIds).size !== actionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Selected planner action IDs must be unique.",
      });
    }
  });

export const plannerApplyResultSchema = z.strictObject({
  proposalId: entityIdSchema,
  outcome: z.enum(["applied", "already_applied"]),
  appliedActionCount: z.number().int().min(0).max(200),
});

export type PlannerAction = z.infer<typeof plannerActionSchema>;
export type PlannerApplyResult = z.infer<typeof plannerApplyResultSchema>;
export type PlannerProposal = z.infer<typeof plannerProposalSchema>;
export type PlannerProposalDto = z.infer<typeof plannerProposalDtoSchema>;
export type PlannerProposalStatus = z.infer<typeof plannerProposalStatusSchema>;
export type PlannerSelection = z.infer<typeof plannerSelectionSchema>;
export type ProposalContextVersions = z.infer<typeof proposalContextVersionsSchema>;

function isNondecreasingInstantRange(startAt: string, endAt: string): boolean {
  try {
    return Temporal.Instant.compare(Temporal.Instant.from(startAt), Temporal.Instant.from(endAt)) <= 0;
  } catch {
    return false;
  }
}
