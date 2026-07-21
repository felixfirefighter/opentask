import { randomUUID } from "node:crypto";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { ApplicationError } from "@/shared/http/application-error";
import { getCompanionState } from "@/modules/companion";

import {
  savedPromptDraftSchema,
  savedPromptUpdateSchema,
  type SavedPromptDraft,
  type SavedPromptUpdate,
} from "./contracts";
import { createPromptRepository } from "../infrastructure/prompt-repository";
import type { createPromptsSchema } from "../infrastructure/schema";

type PromptsSchema = ReturnType<typeof createPromptsSchema>;

export function createPromptApplication({
  database,
  clock,
  tables,
}: {
  database: Database;
  clock: Clock;
  tables: PromptsSchema;
}) {
  const repository = createPromptRepository(database, tables);

  async function requireUnlocked(actor: AuthenticatedActor) {
    const state = await getCompanionState(actor);
    if (state.profile.level < 3)
      throw new ApplicationError("FORBIDDEN", "The Prompt Library unlocks when Ameth reaches level 3.");
  }

  async function list(actor: AuthenticatedActor, includeArchived = false) {
    await requireUnlocked(actor);
    return withTags(actor.userId, await repository.list(actor.userId, includeArchived));
  }

  async function get(actor: AuthenticatedActor, id: string) {
    await requireUnlocked(actor);
    const prompt = await repository.find(actor.userId, id);
    if (!prompt) return null;
    return { ...prompt, tags: (await repository.tagsFor(actor.userId, [id])).map((tag) => tag.name) };
  }

  async function create(actor: AuthenticatedActor, rawDraft: SavedPromptDraft) {
    await requireUnlocked(actor);
    const draft = savedPromptDraftSchema.parse(rawDraft);
    return database.transaction(async (transaction) => {
      const id = randomUUID();
      const [created] = await repository.insert(
        {
          id,
          userId: actor.userId,
          title: draft.title,
          description: draft.description,
          content: draft.content,
          now: clock.now(),
        },
        transaction,
      );
      if (!created) throw new Error("Prompt could not be saved.");
      const tags = normalizedTags(draft.tags);
      await repository.replaceTags(actor.userId, id, tags, transaction);
      return { ...created, tags: tags.map((tag) => tag.name) };
    });
  }

  async function update(actor: AuthenticatedActor, id: string, rawUpdate: SavedPromptUpdate) {
    await requireUnlocked(actor);
    const update = savedPromptUpdateSchema.parse(rawUpdate);
    return database.transaction(async (transaction) => {
      const [updated] = await repository.update(
        actor.userId,
        id,
        update.expectedVersion,
        {
          title: update.title,
          description: update.description,
          content: update.content,
          archivedAt: update.archived ? clock.now() : null,
          now: clock.now(),
        },
        transaction,
      );
      if (!updated)
        throw new ApplicationError("CONFLICT", "This prompt changed elsewhere. Refresh and try again.");
      const tags = normalizedTags(update.tags);
      await repository.replaceTags(actor.userId, id, tags, transaction);
      return { ...updated, tags: tags.map((tag) => tag.name) };
    });
  }

  async function remove(actor: AuthenticatedActor, id: string) {
    await requireUnlocked(actor);
    return Boolean((await repository.delete(actor.userId, id))[0]);
  }

  return { requireUnlocked, list, get, create, update, remove } as const;

  async function withTags<T extends { id: string }>(userId: string, prompts: readonly T[]) {
    const tags = await repository.tagsFor(
      userId,
      prompts.map((prompt) => prompt.id),
    );
    const byPrompt = new Map<string, string[]>();
    for (const tag of tags) byPrompt.set(tag.promptId, [...(byPrompt.get(tag.promptId) ?? []), tag.name]);
    return prompts.map((prompt) => ({ ...prompt, tags: byPrompt.get(prompt.id) ?? [] }));
  }
}

function normalizedTags(tags: readonly string[]) {
  const seen = new Set<string>();
  return tags.flatMap((name) => {
    const normalizedName = name.trim().toLocaleLowerCase("en-US");
    if (seen.has(normalizedName)) return [];
    seen.add(normalizedName);
    return [{ name: name.trim(), normalizedName }];
  });
}
