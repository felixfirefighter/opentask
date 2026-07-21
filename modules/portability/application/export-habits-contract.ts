import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  PORTABLE_HABITS_SECTION_SCHEMA_VERSION,
  boundedUnicode,
  portableColorTokenSchema,
  portableDateSchema,
  portableIdSchema,
  portableInstantSchema,
  portableVersionSchema,
} from "./export-contract-primitives";

const normalizedText = (maximum: number, required: boolean) => {
  const schema = boundedUnicode(maximum).refine((value) => value.normalize("NFC") === value, {
    message: "Portable habit text must be NFC-normalized.",
  });
  return required ? schema.trim().min(1) : schema;
};

const fixedHabitDecimal = (minimum: number) =>
  z
    .number()
    .min(minimum)
    .max(999_999_999.999)
    .refine((value) => {
      const scaled = value * 1_000;
      return value === Math.round(scaled) / 1_000;
    }, "Portable habit values may have at most three decimal places.");

const portableHabitGoalFields = z.discriminatedUnion("goalKind", [
  z.strictObject({
    goalKind: z.literal("boolean"),
    targetValue: z.null(),
    unit: z.null(),
  }),
  z.strictObject({
    goalKind: z.literal("quantity"),
    targetValue: fixedHabitDecimal(0.001),
    unit: normalizedText(40, true),
  }),
]);

const portableHabitSchema = z
  .strictObject({
    id: portableIdSchema,
    title: normalizedText(200, true),
    icon: normalizedText(16, true),
    colorToken: portableColorTokenSchema,
    goalKind: z.enum(["boolean", "quantity"]),
    targetValue: fixedHabitDecimal(0.001).nullable(),
    unit: normalizedText(40, true).nullable(),
    version: portableVersionSchema,
    createdAt: portableInstantSchema,
    updatedAt: portableInstantSchema,
    archivedAt: portableInstantSchema.nullable(),
  })
  .superRefine((habit, context) => {
    const parsed = portableHabitGoalFields.safeParse({
      goalKind: habit.goalKind,
      targetValue: habit.targetValue,
      unit: habit.unit,
    });
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: "The portable habit goal shape is invalid." });
    }
  });

const scheduleFields = {
  habitId: portableIdSchema,
  timezone: ianaTimeZoneSchema,
  startDate: portableDateSchema,
  endDate: portableDateSchema.nullable(),
  createdAt: portableInstantSchema,
  updatedAt: portableInstantSchema,
} as const;

const portableHabitScheduleSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...scheduleFields,
      kind: z.literal("daily"),
      weekdays: z.null(),
      targetPerWeek: z.null(),
    }),
    z.strictObject({
      ...scheduleFields,
      kind: z.literal("weekdays"),
      weekdays: z
        .array(z.number().int().min(1).max(7))
        .min(1)
        .max(7)
        .refine((days) => days.every((day, index) => index === 0 || day > (days[index - 1] ?? 0)), {
          message: "Portable habit weekdays must be unique and ascending.",
        }),
      targetPerWeek: z.null(),
    }),
    z.strictObject({
      ...scheduleFields,
      kind: z.literal("weekly_target"),
      weekdays: z.null(),
      targetPerWeek: z.number().int().min(1).max(7),
    }),
  ])
  .refine(({ startDate, endDate }) => endDate === null || endDate >= startDate, {
    message: "A portable habit schedule end date cannot precede its start date.",
  });

const portableHabitLogSchema = z
  .strictObject({
    id: portableIdSchema,
    habitId: portableIdSchema,
    localDate: portableDateSchema,
    state: z.enum(["completed", "skipped", "unachieved"]),
    quantity: fixedHabitDecimal(0).nullable(),
    note: normalizedText(1_000, false).nullable(),
    version: portableVersionSchema,
    createdAt: portableInstantSchema,
    updatedAt: portableInstantSchema,
  })
  .refine(({ quantity, state }) => state === "completed" || quantity === null, {
    message: "Skipped and unachieved portable habit logs cannot contain a quantity.",
  });

export const portableHabitsSectionSchema = z.strictObject({
  schemaVersion: z.literal(PORTABLE_HABITS_SECTION_SCHEMA_VERSION),
  habits: z.array(portableHabitSchema),
  schedules: z.array(portableHabitScheduleSchema),
  logs: z.array(portableHabitLogSchema),
});

export type PortableHabitsSection = z.infer<typeof portableHabitsSectionSchema>;
