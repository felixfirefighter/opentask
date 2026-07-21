import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { savedPromptTags, savedPrompts } from "@/shared/db/schema";

export function createPromptsExportRepository(executor: DatabaseExecutor) {
  return {
    prompts(userId: string) {
      return executor
        .select()
        .from(savedPrompts)
        .where(eq(savedPrompts.userId, userId))
        .orderBy(asc(savedPrompts.id));
    },
    tags(userId: string) {
      return executor
        .select()
        .from(savedPromptTags)
        .where(eq(savedPromptTags.userId, userId))
        .orderBy(asc(savedPromptTags.promptId), asc(savedPromptTags.normalizedName));
    },
  } as const;
}
