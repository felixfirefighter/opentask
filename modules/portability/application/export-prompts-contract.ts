import { z } from "zod";

import {
  PORTABLE_SECTION_SCHEMA_VERSION,
  portableIdSchema,
  portableInstantSchema,
  portableVersionSchema,
} from "./export-contract-primitives";

export const portablePromptsSectionSchema = z.strictObject({
  schemaVersion: z.literal(PORTABLE_SECTION_SCHEMA_VERSION),
  prompts: z.array(
    z.strictObject({
      id: portableIdSchema,
      title: z.string().min(1).max(120),
      description: z.string().min(1).max(280),
      content: z.string().min(1).max(20_000),
      version: portableVersionSchema,
      createdAt: portableInstantSchema,
      updatedAt: portableInstantSchema,
      archivedAt: portableInstantSchema.nullable(),
      tags: z.array(z.string().min(1).max(32)).max(8),
    }),
  ),
});
