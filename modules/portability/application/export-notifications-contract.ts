import { z } from "zod";

import {
  PORTABLE_NOTIFICATIONS_SECTION_SCHEMA_VERSION,
  portableIdSchema,
  portableInstantSchema,
  portableVersionSchema,
} from "./export-contract-primitives";

const portableReminderSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("absolute"),
    remindAt: portableInstantSchema,
    offsetMinutes: z.null(),
  }),
  z.strictObject({
    kind: z.literal("relative_start"),
    remindAt: z.null(),
    offsetMinutes: z.number().int().min(0).max(10_080),
  }),
]);

export const portableTaskReminderSchema = z
  .strictObject({
    id: portableIdSchema,
    taskId: portableIdSchema,
    enabled: z.boolean(),
    version: portableVersionSchema,
    spec: portableReminderSpecSchema,
    createdAt: portableInstantSchema,
    updatedAt: portableInstantSchema,
  })
  .refine(({ createdAt, updatedAt }) => Date.parse(updatedAt) >= Date.parse(createdAt), {
    message: "A portable reminder cannot be updated before it was created.",
  });

export const portableNotificationsSectionSchema = z
  .strictObject({
    schemaVersion: z.literal(PORTABLE_NOTIFICATIONS_SECTION_SCHEMA_VERSION),
    reminders: z.array(portableTaskReminderSchema),
  })
  .refine(({ reminders }) => isStrictlyOrderedById(reminders), {
    message: "Portable reminders must be ordered by ID without duplicates.",
    path: ["reminders"],
  });

export type PortableNotificationsSection = z.infer<typeof portableNotificationsSectionSchema>;

function isStrictlyOrderedById(rows: readonly Readonly<{ id: string }>[]): boolean {
  return rows.every((row, index) => index === 0 || (rows[index - 1]?.id ?? "") < row.id);
}
