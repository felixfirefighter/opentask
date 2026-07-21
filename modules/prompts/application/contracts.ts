import { z } from "zod";

const promptTagSchema = z.string().trim().min(1).max(32);

export const savedPromptDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(280),
    content: z.string().trim().min(1).max(20_000),
    tags: z.array(promptTagSchema).max(8),
  })
  .strict();

export const savedPromptUpdateSchema = savedPromptDraftSchema
  .extend({
    expectedVersion: z.number().int().positive(),
    archived: z.boolean().optional(),
  })
  .strict();

export const promptAnalysisRequestSchema = z
  .object({ content: z.string().trim().min(1).max(20_000) })
  .strict();
export const promptAnalysisSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(280),
    tags: z.array(promptTagSchema).max(8),
  })
  .strict();

export type SavedPromptDraft = z.infer<typeof savedPromptDraftSchema>;
export type SavedPromptUpdate = z.infer<typeof savedPromptUpdateSchema>;
