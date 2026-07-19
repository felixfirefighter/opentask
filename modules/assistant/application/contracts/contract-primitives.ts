import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

export const PLANNER_SCHEMA_VERSION = 1 as const;
export const PLANNER_MODEL = "gpt-5.6" as const;
export const PLANNER_PROMPT_VERSION = "planner-extraction-v1" as const;

export const entityIdSchema = z.uuidv4().transform((value) => value.toLowerCase());
export const versionSchema = z.number().int().positive().max(2_147_483_647);
export const localDateSchema = z.iso.date();
export const localTimeSchema = z.iso.time({ precision: -1 });
export const instantSchema = z.iso.datetime({ offset: true });
export const timeZoneSchema = ianaTimeZoneSchema;
export const taskPrioritySchema = z.enum(["none", "low", "medium", "high"]);

export const selectedSemanticRefSchema = z
  .string()
  .regex(/^selected-(?:[1-9]|[1-4][0-9]|50)$/u, "Selected references must be ephemeral.");
export const newSemanticRefSchema = z
  .string()
  .regex(/^new-(?:[1-9]|[1-9][0-9]|100)$/u, "New-task references must be ephemeral.");
export const semanticRefSchema = z.union([selectedSemanticRefSchema, newSemanticRefSchema]);

export const taskTitleSchema = boundedText(500, true);
export const taskDescriptionSchema = boundedText(20_000, false);
export const brainDumpSchema = boundedText(20_000, false);
export const summarySchema = boundedText(1_000, true);
export const rationaleSchema = boundedText(1_000, true);
export const uncertaintySchema = boundedText(500, true);
export const constraintNoteSchema = boundedText(500, true);

export const localDateTimeSchema = z.strictObject({
  date: localDateSchema,
  time: localTimeSchema,
});

export function compareLocalDateTimes(
  left: z.infer<typeof localDateTimeSchema>,
  right: z.infer<typeof localDateTimeSchema>,
): number {
  return `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`, "en");
}

function boundedText(maximum: number, nonblank: boolean) {
  return z
    .string()
    .refine((value) => value.isWellFormed() && !value.includes("\u0000"), {
      message: "Text contains a character that cannot be stored safely.",
    })
    .refine((value) => Array.from(value).length <= maximum, {
      message: `Must contain at most ${maximum} Unicode characters.`,
    })
    .refine((value) => !nonblank || (value.length > 0 && value === value.trim()), {
      message: "Text must be nonblank and cannot start or end with whitespace.",
    });
}
