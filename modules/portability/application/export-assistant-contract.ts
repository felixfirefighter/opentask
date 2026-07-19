import { z } from "zod";

import {
  plannerProposalSchema,
  plannerProposalStatusSchema,
  proposalContextVersionsSchema,
} from "@/modules/assistant";

import {
  PORTABLE_SECTION_SCHEMA_VERSION,
  portableDateSchema,
  portableIdSchema,
  portableInstantSchema,
} from "./export-contract-primitives";

const portablePlannerProposalSchema = z
  .strictObject({
    id: portableIdSchema,
    planningDate: portableDateSchema,
    schemaVersion: z.number().int().positive(),
    proposal: plannerProposalSchema,
    contextVersions: proposalContextVersionsSchema,
    status: plannerProposalStatusSchema,
    model: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(100),
    createdAt: portableInstantSchema,
    expiresAt: portableInstantSchema,
    appliedAt: portableInstantSchema.nullable(),
  })
  .superRefine((record, context) => {
    if (record.proposal.schemaVersion !== record.schemaVersion) {
      context.addIssue({ code: "custom", message: "Planner proposal schema metadata must match." });
    }
    if (record.proposal.planningDate !== record.planningDate) {
      context.addIssue({ code: "custom", message: "Planner proposal planning dates must match." });
    }
    if (Date.parse(record.expiresAt) <= Date.parse(record.createdAt)) {
      context.addIssue({ code: "custom", message: "Planner proposal expiry must follow creation." });
    }
    if ((record.status === "applied") !== (record.appliedAt !== null)) {
      context.addIssue({ code: "custom", message: "Applied proposal metadata must change together." });
    }
  });

export const portableAssistantSectionSchema = z.strictObject({
  schemaVersion: z.literal(PORTABLE_SECTION_SCHEMA_VERSION),
  proposals: z.array(portablePlannerProposalSchema),
});

export type PortableAssistantSection = z.infer<typeof portableAssistantSectionSchema>;
