import { z } from "zod";

import {
  PORTABLE_FOCUS_SECTION_SCHEMA_VERSION,
  portableIdSchema,
  portableInstantSchema,
  portableVersionSchema,
} from "./export-contract-primitives";

const portableFocusBase = {
  id: portableIdSchema,
  taskId: portableIdSchema.nullable(),
  habitId: portableIdSchema.nullable(),
  accumulatedActiveSeconds: z.number().int().min(0).max(2_147_483_647),
  startedAt: portableInstantSchema,
  endedAt: portableInstantSchema,
  version: portableVersionSchema,
  createdAt: portableInstantSchema,
  updatedAt: portableInstantSchema,
} as const;

export const portableFocusSessionSchema = z
  .discriminatedUnion("mode", [
    z.strictObject({
      ...portableFocusBase,
      mode: z.literal("pomodoro"),
      plannedSeconds: z.number().int().min(60).max(14_400).multipleOf(60),
    }),
    z.strictObject({
      ...portableFocusBase,
      mode: z.literal("stopwatch"),
      plannedSeconds: z.null(),
    }),
  ])
  .superRefine((session, context) => {
    if (session.taskId !== null && session.habitId !== null) {
      context.addIssue({ code: "custom", message: "A portable focus session may link one item." });
    }
    if (Date.parse(session.endedAt) < Date.parse(session.startedAt)) {
      context.addIssue({ code: "custom", message: "A portable focus session cannot end before it starts." });
    }
  });

export const portableFocusSectionSchema = z.strictObject({
  schemaVersion: z.literal(PORTABLE_FOCUS_SECTION_SCHEMA_VERSION),
  sessions: z.array(portableFocusSessionSchema),
});

export type PortableFocusSection = z.infer<typeof portableFocusSectionSchema>;
