import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { createHabitPortabilityRepository } from "../infrastructure/habit-portability-repository";

export async function readPortableHabits(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const rows = await createHabitPortabilityRepository(executor).readOwned(actor.userId);
  return {
    habits: rows.habits.map((row) => ({
      id: row.id,
      title: row.title,
      icon: row.icon,
      colorToken: row.colorToken,
      goalKind: row.goalKind,
      targetValue: row.targetValue,
      unit: row.unit,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    })),
    schedules: rows.schedules.map((row) => ({
      habitId: row.habitId,
      kind: row.kind,
      weekdays: row.weekdays,
      targetPerWeek: row.targetPerWeek,
      timezone: row.timezone,
      startDate: row.startDate,
      endDate: row.endDate,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    logs: rows.logs.map((row) => ({
      id: row.id,
      habitId: row.habitId,
      localDate: row.localDate,
      state: row.state,
      quantity: row.quantity,
      note: row.note,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  } as const;
}
