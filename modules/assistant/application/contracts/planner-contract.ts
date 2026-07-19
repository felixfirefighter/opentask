import { z } from "zod";

import {
  brainDumpSchema,
  entityIdSchema,
  localDateSchema,
  localTimeSchema,
  timeZoneSchema,
} from "./contract-primitives";

export const plannerInputSchema = z
  .strictObject({
    brainDump: brainDumpSchema,
    selectedTaskIds: z.array(entityIdSchema).max(50),
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
  })
  .superRefine((input, context) => {
    if (input.brainDump.trim().length === 0 && input.selectedTaskIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["brainDump"],
        message: "Provide a brain dump or select at least one task.",
      });
    }

    if (new Set(input.selectedTaskIds).size !== input.selectedTaskIds.length) {
      context.addIssue({
        code: "custom",
        path: ["selectedTaskIds"],
        message: "Selected task IDs must be unique.",
      });
    }
  });

export type PlannerInput = z.infer<typeof plannerInputSchema>;
