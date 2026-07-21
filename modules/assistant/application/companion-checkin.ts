import OpenAI from "openai";
import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import { getDatabase } from "@/shared/db/client";

import { getOpenAIKeyForActor } from "../infrastructure/openai-credential-config";

const companionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));

export type CompanionCheckinResult = Readonly<
  { ok: true; text: string } | { ok: false; reason: "unavailable" | "timeout" | "unknown" }
>;

export async function createCompanionCheckin(
  actor: AuthenticatedActor,
  rawName: string,
  context: Readonly<{
    goals: readonly string[];
    recentCheckins: readonly Readonly<{ date: string; mood: string; note?: string | undefined }>[];
  }>,
): Promise<CompanionCheckinResult> {
  const name = companionNameSchema.parse(rawName);
  const apiKey = await getOpenAIKeyForActor(getDatabase(), actor.userId);
  if (!apiKey) return { ok: false, reason: "unavailable" };

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 0 });
  const instructions = [
    "Omplish is a local-first task companion.",
    "You are Ameth: calm, warm, grounded, private, and honest.",
    "Accompany the user and move them toward one small concrete accomplishment.",
    "Treat slips as data, never failure. Never guilt, fake hype, or manufacture urgency.",
    "Be brief: write exactly one or two sentences.",
    "Greet the user by name and gently ask how they are arriving today. Do not list tasks yet.",
    `User name: ${name}`,
    `User goals: ${JSON.stringify(context.goals)}`,
    `Recent check-ins: ${JSON.stringify(context.recentCheckins)}`,
  ].join(" ");

  try {
    const response = await client.responses.create({
      model: "gpt-5.6",
      instructions,
      input: "Write the opening check-in now.",
      max_output_tokens: 160,
      store: false,
    });
    const text = response.output_text.trim();
    if (response.status !== "completed" || text.length === 0) return { ok: false, reason: "unknown" };
    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name.includes("Timeout") ? "timeout" : "unknown",
    };
  }
}
