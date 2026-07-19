import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  PORTABLE_SECTION_SCHEMA_VERSION,
  boundedUnicode,
  portableColorTokenSchema,
  portableDateSchema,
  portableIdSchema,
  portableInstantSchema,
  portablePrioritySchema,
  portableRankSchema,
  softDeleteFields,
  versionedFields,
} from "./export-contract-primitives";

const namedOrganizerFields = {
  name: boundedUnicode(120).trim().min(1),
  rank: portableRankSchema,
  ...versionedFields,
} as const;

const portableFolderSchema = z.strictObject({
  id: portableIdSchema,
  ...namedOrganizerFields,
  ...softDeleteFields,
});

const portableListSchema = z.strictObject({
  id: portableIdSchema,
  folderId: portableIdSchema.nullable(),
  name: boundedUnicode(120).trim().min(1),
  colorToken: portableColorTokenSchema,
  rank: portableRankSchema,
  kind: z.enum(["inbox", "regular"]),
  ...versionedFields,
  ...softDeleteFields,
});

const portableSectionSchema = z.strictObject({
  id: portableIdSchema,
  listId: portableIdSchema,
  ...namedOrganizerFields,
});

const portableTaskSchema = z.strictObject({
  id: portableIdSchema,
  listId: portableIdSchema,
  sectionId: portableIdSchema.nullable(),
  parentTaskId: portableIdSchema.nullable(),
  title: boundedUnicode(500).trim().min(1),
  descriptionMd: boundedUnicode(20_000),
  status: z.enum(["open", "completed", "cancelled"]),
  priority: portablePrioritySchema,
  rank: portableRankSchema,
  statusChangedAt: portableInstantSchema,
  ...versionedFields,
  ...softDeleteFields,
});

const portableScheduleSchema = z.discriminatedUnion("kind", [
  z
    .strictObject({
      taskId: portableIdSchema,
      kind: z.literal("all_day"),
      startDate: portableDateSchema,
      endDate: portableDateSchema,
      createdAt: portableInstantSchema,
      updatedAt: portableInstantSchema,
    })
    .refine(({ startDate, endDate }) => startDate < endDate, {
      message: "An exported all-day schedule must use an exclusive end date.",
    }),
  z
    .strictObject({
      taskId: portableIdSchema,
      kind: z.literal("timed"),
      startAt: portableInstantSchema,
      endAt: portableInstantSchema,
      timezone: ianaTimeZoneSchema,
      createdAt: portableInstantSchema,
      updatedAt: portableInstantSchema,
    })
    .refine(({ startAt, endAt }) => Date.parse(startAt) <= Date.parse(endAt), {
      message: "An exported timed schedule cannot end before it starts.",
    }),
]);

const portableChecklistItemSchema = z.strictObject({
  id: portableIdSchema,
  taskId: portableIdSchema,
  title: boundedUnicode(500).trim().min(1),
  isCompleted: z.boolean(),
  rank: portableRankSchema,
  ...versionedFields,
});

const portableTagSchema = z.strictObject({
  id: portableIdSchema,
  name: boundedUnicode(120).trim().min(1),
  colorToken: portableColorTokenSchema,
  ...versionedFields,
  ...softDeleteFields,
});

const portableTaskTagSchema = z.strictObject({ taskId: portableIdSchema, tagId: portableIdSchema });

export const portableTasksSectionSchema = z.strictObject({
  schemaVersion: z.literal(PORTABLE_SECTION_SCHEMA_VERSION),
  folders: z.array(portableFolderSchema),
  lists: z.array(portableListSchema),
  sections: z.array(portableSectionSchema),
  tasks: z.array(portableTaskSchema),
  schedules: z.array(portableScheduleSchema),
  checklistItems: z.array(portableChecklistItemSchema),
  tags: z.array(portableTagSchema),
  taskTags: z.array(portableTaskTagSchema),
});

export type PortableTasksSection = z.infer<typeof portableTasksSectionSchema>;
