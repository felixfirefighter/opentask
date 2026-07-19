import { z } from "zod";

import {
  entityIdSchema,
  newSemanticRefSchema,
  selectedSemanticRefSchema,
  taskTitleSchema,
} from "./contract-primitives";

const selectedSubjectSchema = z.strictObject({
  semanticRef: selectedSemanticRefSchema,
  title: taskTitleSchema,
  source: z.literal("selected_task"),
  taskId: entityIdSchema,
});

const newSubjectSchema = z.strictObject({
  semanticRef: newSemanticRefSchema,
  title: taskTitleSchema,
  source: z.literal("brain_dump"),
  taskId: z.null(),
});

export const plannerProposalSubjectSchema = z.discriminatedUnion("source", [
  selectedSubjectSchema,
  newSubjectSchema,
]);

export const plannerProposalSubjectsSchema = z
  .array(plannerProposalSubjectSchema)
  .max(100)
  .superRefine((subjects, context) => {
    const references = subjects.map(({ semanticRef }) => semanticRef);
    if (new Set(references).size !== references.length) {
      context.addIssue({
        code: "custom",
        message: "Proposal subject references must be unique.",
      });
    }

    const taskIds = subjects.flatMap(({ taskId }) => (taskId === null ? [] : [taskId]));
    if (new Set(taskIds).size !== taskIds.length) {
      context.addIssue({
        code: "custom",
        message: "A task can have only one proposal subject reference.",
      });
    }
  });

export type PlannerProposalSubject = z.infer<typeof plannerProposalSubjectSchema>;
