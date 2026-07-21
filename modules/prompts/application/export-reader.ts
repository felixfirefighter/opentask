import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";
import { createPromptsExportRepository } from "../infrastructure/export-repository";

export async function readPortableSavedPrompts(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const repository = createPromptsExportRepository(executor);
  const [prompts, tags] = await Promise.all([
    repository.prompts(actor.userId),
    repository.tags(actor.userId),
  ]);
  const tagsByPrompt = new Map<string, string[]>();
  for (const tag of tags)
    tagsByPrompt.set(tag.promptId, [...(tagsByPrompt.get(tag.promptId) ?? []), tag.name]);
  return prompts.map((prompt) => ({
    id: prompt.id,
    title: prompt.title,
    description: prompt.description,
    content: prompt.content,
    version: prompt.version,
    createdAt: prompt.createdAt.toISOString(),
    updatedAt: prompt.updatedAt.toISOString(),
    archivedAt: prompt.archivedAt?.toISOString() ?? null,
    tags: tagsByPrompt.get(prompt.id) ?? [],
  }));
}
