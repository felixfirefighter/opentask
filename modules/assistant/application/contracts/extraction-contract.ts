import { z } from "zod";

import {
  PLANNER_SCHEMA_VERSION,
  brainDumpSchema,
  compareLocalDateTimes,
  constraintNoteSchema,
  localDateSchema,
  localDateTimeSchema,
  localTimeSchema,
  newSemanticRefSchema,
  rationaleSchema,
  selectedSemanticRefSchema,
  summarySchema,
  taskPrioritySchema,
  taskTitleSchema,
  timeZoneSchema,
  uncertaintySchema,
} from "./contract-primitives";

const selectedTaskContextSchema = z.strictObject({
  semanticRef: selectedSemanticRefSchema,
  title: taskTitleSchema,
  priority: taskPrioritySchema,
});

const extractionSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("selected_task"), semanticRef: selectedSemanticRefSchema }),
  z.strictObject({ kind: z.literal("brain_dump"), semanticRef: newSemanticRefSchema }),
]);

const flexibleTimingSchema = z
  .strictObject({
    kind: z.literal("flexible"),
    earliestStart: localDateTimeSchema.nullable(),
    deadline: localDateTimeSchema.nullable(),
  })
  .superRefine((timing, context) => {
    if (
      timing.earliestStart &&
      timing.deadline &&
      compareLocalDateTimes(timing.earliestStart, timing.deadline) >= 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["deadline"],
        message: "A deadline must be later than the earliest start.",
      });
    }
  });

const fixedTimingSchema = z
  .strictObject({
    kind: z.literal("fixed"),
    start: localDateTimeSchema,
    end: localDateTimeSchema,
  })
  .superRefine((timing, context) => {
    if (compareLocalDateTimes(timing.start, timing.end) >= 0) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "A fixed interval must end after it starts.",
      });
    }
  });

export const plannerExtractionRequestSchema = z
  .strictObject({
    schemaVersion: z.literal(PLANNER_SCHEMA_VERSION),
    brainDump: brainDumpSchema,
    planningDate: localDateSchema,
    timeZone: timeZoneSchema,
    workWindow: z
      .strictObject({ start: localTimeSchema, end: localTimeSchema })
      .refine((window) => window.start < window.end, {
        path: ["end"],
        message: "The work window must end after it starts.",
      }),
    defaultDurationMinutes: z.number().int().min(5).max(480),
    bufferMinutes: z.number().int().min(0).max(120),
    selectedTasks: z.array(selectedTaskContextSchema).max(50),
  })
  .superRefine((request, context) => {
    if (request.brainDump.trim().length === 0 && request.selectedTasks.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["brainDump"],
        message: "Provide a brain dump or select at least one task.",
      });
    }

    addDuplicateReferenceIssues(
      request.selectedTasks.map(({ semanticRef }) => semanticRef),
      context,
      ["selectedTasks"],
    );
  });

const extractedTaskSchema = z.strictObject({
  source: extractionSourceSchema,
  title: taskTitleSchema,
  detail: summarySchema.nullable(),
  estimateMinutes: z.number().int().min(5).max(480),
  priority: taskPrioritySchema,
  timing: z.discriminatedUnion("kind", [flexibleTimingSchema, fixedTimingSchema]),
  constraints: z.array(constraintNoteSchema).max(10),
  uncertainties: z.array(uncertaintySchema).max(10),
  rationale: rationaleSchema,
});

export const modelExtractionSchema = z
  .strictObject({
    schemaVersion: z.literal(PLANNER_SCHEMA_VERSION),
    disposition: z.enum(["actionable", "partially_actionable", "irrelevant"]),
    summary: summarySchema,
    tasks: z.array(extractedTaskSchema).max(100),
    uncertainties: z.array(uncertaintySchema).max(20),
  })
  .superRefine((extraction, context) => {
    addDuplicateReferenceIssues(
      extraction.tasks.map(({ source }) => source.semanticRef),
      context,
      ["tasks"],
    );

    if (extraction.disposition === "irrelevant" && extraction.tasks.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["tasks"],
        message: "Irrelevant input cannot produce task suggestions.",
      });
    }

    if (extraction.disposition === "actionable" && extraction.tasks.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["tasks"],
        message: "Actionable input must produce at least one task suggestion.",
      });
    }
  });

export function validateExtractionReferences(
  request: PlannerExtractionRequest,
  extraction: ModelExtraction,
): boolean {
  const selectedReferences = new Set(request.selectedTasks.map(({ semanticRef }) => semanticRef));
  return extraction.tasks.every(
    ({ source }) => source.kind !== "selected_task" || selectedReferences.has(source.semanticRef),
  );
}

function addDuplicateReferenceIssues(
  references: readonly string[],
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[],
) {
  if (new Set(references).size !== references.length) {
    context.addIssue({ code: "custom", path, message: "Semantic references must be unique." });
  }
}

export type ModelExtraction = z.infer<typeof modelExtractionSchema>;
export type PlannerExtractionRequest = z.infer<typeof plannerExtractionRequestSchema>;
