import { z } from "zod";

import { portableAssistantSectionSchema } from "./export-assistant-contract";
import { USER_EXPORT_SCHEMA_VERSION, portableInstantSchema } from "./export-contract-primitives";
import { portableIdentitySectionSchema } from "./export-identity-contract";
import { portableHabitsSectionSchema } from "./export-habits-contract";
import { portableFocusSectionSchema } from "./export-focus-contract";
import { portableTasksSectionSchema } from "./export-tasks-contract";

export const userExportEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(USER_EXPORT_SCHEMA_VERSION),
  exportedAt: portableInstantSchema,
  identity: portableIdentitySectionSchema,
  tasks: portableTasksSectionSchema,
  habits: portableHabitsSectionSchema,
  focus: portableFocusSectionSchema,
  assistant: portableAssistantSectionSchema,
});

export type UserExportEnvelope = z.infer<typeof userExportEnvelopeSchema>;
