import { z } from "zod";
import { Temporal } from "temporal-polyfill";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import { FOCUS_HISTORY_MAX_ITEMS, FOCUS_SUMMARY_DAYS } from "../../domain/focus-limits";
import {
  focusHistoryQuerySchema,
  focusIdSchema,
  focusInstantSchema,
  focusOpaqueCursorSchema,
} from "./focus-contract-primitives";
import { focusResolvedLinkSchema, type FocusResolvedLink } from "./focus-link-validator";
import { focusSessionDtoSchema } from "./focus-session-contract";

const summarySecondsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const focusLocalDateSchema = z.iso.date();

export const focusSummaryDaySchema = z.strictObject({
  localDate: focusLocalDateSchema,
  totalSeconds: summarySecondsSchema,
});

export const focusSummarySchema = z
  .strictObject({
    timezone: ianaTimeZoneSchema,
    todayLocalDate: focusLocalDateSchema,
    todaySeconds: summarySecondsSchema,
    sevenDaySeconds: summarySecondsSchema,
    days: z.array(focusSummaryDaySchema).length(FOCUS_SUMMARY_DAYS),
  })
  .superRefine((summary, context) => {
    for (let index = 1; index < summary.days.length; index += 1) {
      const previous = summary.days[index - 1];
      const current = summary.days[index];
      if (
        previous &&
        current &&
        Temporal.PlainDate.from(previous.localDate).add({ days: 1 }).toString() !== current.localDate
      ) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "localDate"],
          message: "Focus summary days must be consecutive and oldest first.",
        });
      }
    }

    const today = summary.days.at(-1);
    if (!today || today.localDate !== summary.todayLocalDate || today.totalSeconds !== summary.todaySeconds) {
      context.addIssue({ code: "custom", message: "The focus summary today values do not match." });
    }
    const total = summary.days.reduce((sum, day) => sum + day.totalSeconds, 0);
    if (!Number.isSafeInteger(total) || total !== summary.sevenDaySeconds) {
      context.addIssue({ code: "custom", message: "The seven-day focus total does not match its days." });
    }
  });

export const completedFocusSessionDtoSchema = focusSessionDtoSchema.refine(
  (session) => session.kind === "focus" && session.state === "completed" && session.endedAt !== null,
  "Recent history contains completed focus sessions only.",
);

export const focusHistoryLinkSchema = focusResolvedLinkSchema;

export const focusHistoryItemDtoSchema = z
  .strictObject({
    session: completedFocusSessionDtoSchema,
    link: focusHistoryLinkSchema.nullable(),
  })
  .superRefine((item, context) => {
    const expected = item.session.taskId
      ? { kind: "task", id: item.session.taskId }
      : item.session.habitId
        ? { kind: "habit", id: item.session.habitId }
        : null;
    if (
      (expected === null && item.link !== null) ||
      (expected !== null &&
        (item.link === null || item.link.kind !== expected.kind || item.link.id !== expected.id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["link"],
        message: "The hydrated focus history link does not match its session.",
      });
    }
  });

export const focusHistoryPageSchema = z
  .strictObject({
    items: z.array(focusHistoryItemDtoSchema).max(FOCUS_HISTORY_MAX_ITEMS),
    nextCursor: focusOpaqueCursorSchema.nullable(),
  })
  .superRefine((page, context) => {
    for (let index = 1; index < page.items.length; index += 1) {
      const previous = page.items[index - 1]?.session;
      const current = page.items[index]?.session;
      if (!previous?.endedAt || !current?.endedAt) continue;
      const timeOrder = new Date(previous.endedAt).getTime() - new Date(current.endedAt).getTime();
      if (timeOrder < 0 || (timeOrder === 0 && previous.id <= current.id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Recent focus history must be ordered by end time and ID descending.",
        });
      }
    }
  });

export const focusHistoryCursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  userId: focusIdSchema,
  endedAt: focusInstantSchema,
  id: focusIdSchema,
});

export { focusHistoryQuerySchema };

export type FocusHistoryCursorPayload = z.infer<typeof focusHistoryCursorPayloadSchema>;
export type FocusHistoryItemDto = z.infer<typeof focusHistoryItemDtoSchema>;
export type FocusHistoryLink = FocusResolvedLink;
export type FocusHistoryPage = z.infer<typeof focusHistoryPageSchema>;
export type FocusSummary = z.infer<typeof focusSummarySchema>;
export type FocusSummaryDay = z.infer<typeof focusSummaryDaySchema>;
