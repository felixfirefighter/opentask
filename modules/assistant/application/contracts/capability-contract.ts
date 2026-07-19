import { z } from "zod";

import { PLANNER_MODEL, PLANNER_SCHEMA_VERSION } from "./contract-primitives";

export const plannerCapabilitySchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    model: z.literal(PLANNER_MODEL),
    schemaVersion: z.literal(PLANNER_SCHEMA_VERSION),
  }),
  z.strictObject({
    state: z.literal("disabled"),
    reason: z.literal("missing_api_key"),
  }),
]);

export type PlannerCapability = z.infer<typeof plannerCapabilitySchema>;
