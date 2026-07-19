import { z } from "zod";

import { countLocalDays } from "../domain/projections/local-time-policy";

export const PLANNING_PROJECTION_MAX_ROWS = 500;
export const PLANNING_RANGE_MAX_LOCAL_DAYS = 62;

export const projectionLimitQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(PLANNING_PROJECTION_MAX_ROWS).default(250),
});

export const planningRangeQuerySchema = z
  .strictObject({
    rangeStartDate: z.iso.date(),
    rangeEndDate: z.iso.date(),
    limit: z.coerce.number().int().min(1).max(PLANNING_PROJECTION_MAX_ROWS).default(250),
  })
  .superRefine((range, context) => {
    try {
      const days = countLocalDays(range.rangeStartDate, range.rangeEndDate);
      if (days <= 0) {
        context.addIssue({ code: "custom", message: "The planning range must be non-empty." });
      } else if (days > PLANNING_RANGE_MAX_LOCAL_DAYS) {
        context.addIssue({
          code: "custom",
          message: `The planning range cannot exceed ${PLANNING_RANGE_MAX_LOCAL_DAYS} local days.`,
        });
      }
    } catch {
      context.addIssue({ code: "custom", message: "The planning range is invalid." });
    }
  });

export const smartDestinationSchema = z.enum(["today", "upcoming"]);

export type PlanningRangeQuery = z.infer<typeof planningRangeQuerySchema>;
export type ProjectionLimitQuery = z.infer<typeof projectionLimitQuerySchema>;
export type SmartDestination = z.infer<typeof smartDestinationSchema>;
