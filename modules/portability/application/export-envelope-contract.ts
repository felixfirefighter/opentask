import { z } from "zod";

import { portableAssistantSectionSchema } from "./export-assistant-contract";
import { USER_EXPORT_SCHEMA_VERSION, portableInstantSchema } from "./export-contract-primitives";
import { portableIdentitySectionSchema } from "./export-identity-contract";
import { portableTasksSectionSchema } from "./export-tasks-contract";
import { portableCompanionSectionSchema } from "./export-companion-contract";
import { portablePromptsSectionSchema } from "./export-prompts-contract";

export const userExportEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(USER_EXPORT_SCHEMA_VERSION),
  exportedAt: portableInstantSchema,
  identity: portableIdentitySectionSchema,
  tasks: portableTasksSectionSchema,
  assistant: portableAssistantSectionSchema,
  companion: portableCompanionSectionSchema,
  prompts: portablePromptsSectionSchema,
});

export type UserExportEnvelope = z.infer<typeof userExportEnvelopeSchema>;
