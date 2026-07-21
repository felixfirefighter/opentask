import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  companionChatRequestSchema,
  companionLevelSchema,
  companionPreferencePatchSchema,
  companionSummarySchema,
  type CompanionActionType,
  type CompanionChatRequest,
  companionMemoryRequestSchema,
  type CompanionPreferencePatch,
} from "./contracts";
import { createCompanionRepository } from "../infrastructure/companion-repository";
import type { createCompanionSchema } from "../infrastructure/schema";

const LEVELS = [
  { level: 1 as const, name: "Acquaintance", threshold: 0, nextThreshold: 300 },
  { level: 2 as const, name: "Familiar", threshold: 300, nextThreshold: 1_000 },
  { level: 3 as const, name: "Trusted companion", threshold: 1_000, nextThreshold: null },
] as const;

const ACTIONS = [
  { type: "task_completed", label: "Complete a task", xp: 10 },
  { type: "planner_applied", label: "Apply a planning proposal", xp: 20 },
  { type: "daily_checkin", label: "Complete today’s check-in", xp: 10 },
  { type: "focus_completed", label: "Complete five active Focus minutes", xp: 1 },
] as const;

type CompanionSchema = ReturnType<typeof createCompanionSchema>;

const memoryByteLimit = 30 * 1024 * 1024;

export function createCompanionApplication({
  database,
  clock,
  tables,
}: {
  database: Database;
  clock: Clock;
  tables: CompanionSchema;
}) {
  const repository = createCompanionRepository(database, tables);

  async function ensureProfile(actor: AuthenticatedActor, executor: DatabaseExecutor = database) {
    return repository.ensureProfile(actor.userId, executor);
  }

  async function award(
    actor: AuthenticatedActor,
    input: Readonly<{ actionType: CompanionActionType; sourceKey: string; xp: number; localDate: string }>,
    executor: DatabaseExecutor = database,
  ) {
    await ensureProfile(actor, executor);
    const sourceKey = input.sourceKey.trim();
    if (!sourceKey || sourceKey.length > 180) throw new Error("Invalid companion XP source.");
    const [inserted] = await repository.insertAward(
      {
        userId: actor.userId,
        actionType: input.actionType,
        sourceKey,
        xp: input.xp,
        localDate: input.localDate,
      },
      executor,
    );
    if (!inserted) return { awarded: false, xp: 0 };
    const [updated] = await repository.updateAwardedProfile(actor.userId, inserted.xp, clock.now(), executor);
    return { awarded: true, xp: inserted.xp, level: updated ? companionLevelSchema.parse(updated.level) : 1 };
  }

  async function getState(actor: AuthenticatedActor, localDate: string) {
    const [profile, summary, recentEvents, memories] = await Promise.all([
      ensureProfile(actor),
      repository.getSummary(actor.userId),
      repository.recentEvents(actor.userId),
      repository.listMemories(actor.userId),
    ]);
    const level = companionLevelSchema.parse(profile.level);
    const definition = LEVELS[level - 1]!;
    return {
      profile: {
        totalXp: profile.totalXp,
        level,
        levelName: definition.name,
        nextLevelXp: definition.nextThreshold,
        version: profile.version,
        proactiveMessages: profile.proactiveMessages as "enabled" | "muted",
        communicationStyle: profile.communicationStyle as "warm" | "focused" | "direct",
        dailyMode: profile.dailyModeDate === localDate ? profile.dailyMode : null,
      },
      actions: ACTIONS,
      unlocks: LEVELS.map((item) => ({ ...item, unlocked: level >= item.level })),
      summary: summary ? companionSummarySchema.parse(summary.summary) : null,
      recentXp: recentEvents.map((event) => ({
        actionType: event.actionType,
        xp: event.xp,
        createdAt: event.createdAt.toISOString(),
      })),
      memories: memories
        .slice(-20)
        .reverse()
        .map((memory) => ({
          id: memory.id,
          text: memory.text,
          createdAt: memory.createdAt.toISOString(),
        })),
    };
  }

  async function updatePreferences(
    actor: AuthenticatedActor,
    expectedVersion: number,
    rawPatch: CompanionPreferencePatch,
    localDate: string,
  ) {
    const patch = companionPreferencePatchSchema.parse(rawPatch);
    await ensureProfile(actor);
    const [updated] = await repository.updatePreferences(
      actor.userId,
      expectedVersion,
      {
        ...(patch.proactiveMessages === undefined ? {} : { proactiveMessages: patch.proactiveMessages }),
        ...(patch.communicationStyle === undefined ? {} : { communicationStyle: patch.communicationStyle }),
      },
      clock.now(),
    );
    if (!updated) throw new Error("Your companion preferences changed elsewhere. Refresh and try again.");
    return getState(actor, localDate);
  }

  async function refreshSummary(actor: AuthenticatedActor, localDate: string) {
    const events = await repository.allEvents(actor.userId);
    const xpEarned = events.reduce((total, event) => total + event.xp, 0);
    const days = new Map<string, number>();
    for (const event of events) days.set(event.localDate, (days.get(event.localDate) ?? 0) + event.xp);
    const strongestDay = [...days.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
    const summary = companionSummarySchema.parse({
      completionCount: events.filter((event) => event.actionType === "task_completed").length,
      xpEarned,
      strongestDay,
      message:
        events.length === 0
          ? "Start with one small task. Ameth will notice the pattern as you go."
          : "Your progress is building through small, deliberate actions.",
    });
    await repository.saveSummary({
      userId: actor.userId,
      summary,
      windowStartedOn: strongestDay ?? localDate,
      windowEndedOn: localDate,
      generatedAt: clock.now(),
    });
    return summary;
  }

  async function chat(actor: AuthenticatedActor, rawInput: CompanionChatRequest, localDate: string) {
    const input = companionChatRequestSchema.parse(rawInput);
    const state = await getState(actor, localDate);
    const memories = await repository.listMemories(actor.userId);
    const { createAmethChatReply } = await import("@/modules/assistant");
    const response = await createAmethChatReply(actor, {
      message: input.message,
      tone: (input.mode ?? state.profile.dailyMode ?? state.profile.communicationStyle) as
        "warm" | "focused" | "direct",
      summary: state.summary?.message ?? null,
      approvedMemories: memories.map((memory) => memory.text).slice(-20),
    });
    const plannerHandoff = /\b(plan|schedule|prioriti[sz]e)\b/i.test(input.message);
    if (response.available) return { reply: response.reply, plannerHandoff, available: true };
    return {
      reply: plannerHandoff
        ? "I can help you prepare a plan. Open Plan when you are ready to review every suggested change before it is applied."
        : "Ameth’s live chat is unavailable right now. Your tasks remain private and unchanged; you can still use the local progress view.",
      plannerHandoff,
      available: false,
    };
  }

  async function deleteData(actor: AuthenticatedActor) {
    await repository.deleteData(actor.userId);
  }

  async function saveMemory(actor: AuthenticatedActor, rawInput: unknown) {
    const input = companionMemoryRequestSchema.parse(rawInput);
    return database.transaction(async (transaction) => {
      const existing = await repository.listMemories(actor.userId);
      const incomingBytes = new TextEncoder().encode(input.text).byteLength;
      let totalBytes = existing.reduce(
        (total, memory) => total + new TextEncoder().encode(memory.text).byteLength,
        0,
      );
      const evictedIds: string[] = [];
      for (const memory of existing) {
        if (totalBytes + incomingBytes <= memoryByteLimit) break;
        totalBytes -= new TextEncoder().encode(memory.text).byteLength;
        evictedIds.push(memory.id);
      }
      await repository.deleteMemories(actor.userId, evictedIds, transaction);
      const [saved] = await repository.saveMemory(actor.userId, input.text, clock.now(), transaction);
      if (!saved) throw new Error("Companion memory could not be saved.");
      return { saved, evictedCount: evictedIds.length };
    });
  }

  async function removeMemory(actor: AuthenticatedActor, memoryId: string) {
    const [deleted] = await repository.deleteMemory(actor.userId, memoryId);
    return Boolean(deleted);
  }

  async function setDailyMode(
    actor: AuthenticatedActor,
    mode: "warm" | "focused" | "direct",
    localDate: string,
  ) {
    await ensureProfile(actor);
    await repository.setDailyMode(actor.userId, mode, localDate, clock.now());
    return getState(actor, localDate);
  }

  return {
    award,
    getState,
    updatePreferences,
    refreshSummary,
    chat,
    deleteData,
    saveMemory,
    removeMemory,
    setDailyMode,
  } as const;
}
