import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  createHabitRequestSchema,
  habitDefinitionPageSchema,
  habitIdSchema,
  habitLifecyclePageQuerySchema,
  habitLifecycleRequestSchema,
  updateHabitRequestSchema,
  type CreateHabitRequest,
  type HabitDetailDto,
  type HabitDefinitionPage,
  type HabitLifecyclePageQuery,
  type UpdateHabitRequest,
} from "./contracts";
import { assertActiveHabit, assertArchivedHabit, requireHabitWrite } from "./habit-application-support";
import { habitConflict, habitNotFound } from "./habit-errors";
import { decodeHabitPageCursor, habitPageAfter, habitPageFromRows } from "./habit-page-cursor";
import { mapHabitDetail, storedHabitGoal, toScheduleWrite } from "./habit-mapper";
import { createPostgresHabitReadSnapshot, type HabitReadSnapshot } from "./habit-read-snapshot";
import { createHabitRepository, type StoredHabit } from "../infrastructure/habit-repository";
import {
  createHabitScheduleRepository,
  type StoredHabitSchedule,
} from "../infrastructure/habit-schedule-repository";

export type HabitCreateResult = Readonly<{ created: boolean; value: HabitDetailDto }>;

export function createHabitDefinitionApplication({
  database,
  clock,
  snapshot = createPostgresHabitReadSnapshot(database),
}: {
  database: Database;
  clock: Clock;
  snapshot?: HabitReadSnapshot;
}) {
  const habits = createHabitRepository(database);
  const schedules = createHabitScheduleRepository(database);

  return {
    async listHabits(
      actor: AuthenticatedActor,
      rawQuery: HabitLifecyclePageQuery,
    ): Promise<HabitDefinitionPage> {
      const query = habitLifecyclePageQuerySchema.parse(rawQuery);
      return snapshot.run(async (transaction) => {
        const cursor = decodeHabitPageCursor(query.cursor, "definitions", query.lifecycle);
        const anchor = cursor
          ? await habits.findPageAnchor(actor.userId, query.lifecycle, cursor.id, transaction)
          : null;
        const after = habitPageAfter(cursor, anchor);
        const habitPage = habitPageFromRows(
          await habits.listPageByLifecycle(
            actor.userId,
            query.lifecycle,
            { limit: query.limit + 1, ...(after ? { after } : {}) },
            transaction,
          ),
          query.limit,
          "definitions",
          query.lifecycle,
        );
        const scheduleRows = await schedules.listForHabitIds(
          actor.userId,
          habitPage.items.map(({ id }) => id),
          transaction,
        );
        const schedulesByHabit = new Map(scheduleRows.map((row) => [row.habitId, row]));
        return habitDefinitionPageSchema.parse({
          items: habitPage.items.map((habit) => {
            const schedule = schedulesByHabit.get(habit.id);
            if (!schedule) throw missingSchedule();
            return mapHabitDetail(habit, schedule);
          }),
          nextCursor: habitPage.nextCursor,
        });
      });
    },

    async getHabit(actor: AuthenticatedActor, rawHabitId: string): Promise<HabitDetailDto> {
      const habitId = habitIdSchema.parse(rawHabitId);
      return snapshot.run(async (transaction) => {
        const habit = await habits.findById(actor.userId, habitId, transaction);
        if (!habit) throw habitNotFound();
        const schedule = await schedules.findByHabitId(actor.userId, habitId, transaction);
        if (!schedule) throw missingSchedule();
        return mapHabitDetail(habit, schedule);
      });
    },

    async createHabit(
      actor: AuthenticatedActor,
      rawResourceId: string,
      rawInput: CreateHabitRequest,
    ): Promise<HabitCreateResult> {
      const resourceId = habitIdSchema.parse(rawResourceId);
      const input = createHabitRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const replay = await habits.lockById(actor.userId, resourceId, transaction);
        if (replay) return habitReplay(replay, input, transaction);

        const now = clock.now();
        const created = await habits.insert(
          {
            id: resourceId,
            userId: actor.userId,
            definition: definitionFromInput(input),
            now,
          },
          transaction,
        );
        if (!created) {
          const concurrent = await habits.lockById(actor.userId, resourceId, transaction);
          if (!concurrent) throw habitConflict("This habit identifier could not be reserved safely.");
          return habitReplay(concurrent, input, transaction);
        }
        const schedule = await schedules.insert(
          {
            userId: actor.userId,
            habitId: resourceId,
            schedule: toScheduleWrite(input.schedule),
            now,
          },
          transaction,
        );
        if (!schedule) throw habitConflict("This habit schedule already exists.");
        return { created: true, value: mapHabitDetail(created, schedule) };
      });
    },

    async updateHabit(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawInput: UpdateHabitRequest,
    ): Promise<HabitDetailDto> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const input = updateHabitRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await habits.lockById(actor.userId, habitId, transaction);
        assertActiveHabit(current, input.expectedVersion);
        const schedule = await schedules.lockByHabitId(actor.userId, habitId, transaction);
        if (!schedule) throw missingSchedule();
        const currentGoal = storedHabitGoal(current);
        const updated = requireHabitWrite(
          await habits.updateDefinition(
            {
              userId: actor.userId,
              id: habitId,
              expectedVersion: input.expectedVersion,
              definition: {
                title: input.patch.title ?? current.title,
                icon: input.patch.icon ?? current.icon,
                colorToken: input.patch.colorToken ?? current.colorToken,
                goalKind: (input.patch.goal ?? currentGoal).goalKind,
                targetValue: (input.patch.goal ?? currentGoal).targetValue,
                unit: (input.patch.goal ?? currentGoal).unit,
              },
              now: clock.now(),
            },
            transaction,
          ),
        );
        return mapHabitDetail(updated, schedule);
      });
    },

    async archiveHabit(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawInput: { expectedVersion: number },
    ): Promise<HabitDetailDto> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const input = habitLifecycleRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await habits.lockById(actor.userId, habitId, transaction);
        assertActiveHabit(current, input.expectedVersion);
        const schedule = await schedules.lockByHabitId(actor.userId, habitId, transaction);
        if (!schedule) throw missingSchedule();
        const archived = requireHabitWrite(
          await habits.archive(
            { userId: actor.userId, id: habitId, expectedVersion: input.expectedVersion, now: clock.now() },
            transaction,
          ),
        );
        return mapHabitDetail(archived, schedule);
      });
    },

    async restoreHabit(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawInput: { expectedVersion: number },
    ): Promise<HabitDetailDto> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const input = habitLifecycleRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await habits.lockById(actor.userId, habitId, transaction);
        assertArchivedHabit(current, input.expectedVersion);
        const schedule = await schedules.lockByHabitId(actor.userId, habitId, transaction);
        if (!schedule) throw missingSchedule();
        const restored = requireHabitWrite(
          await habits.restore(
            { userId: actor.userId, id: habitId, expectedVersion: input.expectedVersion, now: clock.now() },
            transaction,
          ),
        );
        return mapHabitDetail(restored, schedule);
      });
    },
  } as const;

  async function habitReplay(
    existing: StoredHabit,
    input: CreateHabitRequest,
    transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  ): Promise<HabitCreateResult> {
    const schedule = await schedules.lockByHabitId(existing.userId, existing.id, transaction);
    if (!schedule || !sameDefinition(existing, input) || !sameSchedule(schedule, input)) {
      throw habitConflict("This habit identifier was already used for different content.", existing.version);
    }
    return { created: false, value: mapHabitDetail(existing, schedule) };
  }
}

function definitionFromInput(input: CreateHabitRequest) {
  return {
    title: input.title,
    icon: input.icon,
    colorToken: input.colorToken,
    goalKind: input.goal.goalKind,
    targetValue: input.goal.targetValue,
    unit: input.goal.unit,
  } as const;
}

function sameDefinition(existing: StoredHabit, input: CreateHabitRequest): boolean {
  const expected = definitionFromInput(input);
  return (
    existing.title === expected.title &&
    existing.icon === expected.icon &&
    existing.colorToken === expected.colorToken &&
    existing.goalKind === expected.goalKind &&
    existing.targetValue === expected.targetValue &&
    existing.unit === expected.unit
  );
}

function sameSchedule(existing: StoredHabitSchedule, input: CreateHabitRequest): boolean {
  const expected = toScheduleWrite(input.schedule);
  return (
    existing.kind === expected.kind &&
    sameArray(existing.weekdays, expected.weekdays) &&
    existing.targetPerWeek === expected.targetPerWeek &&
    existing.timezone === expected.timezone &&
    existing.startDate === expected.startDate &&
    existing.endDate === expected.endDate
  );
}

function sameArray(left: readonly number[] | null, right: readonly number[] | null): boolean {
  return (
    left === right ||
    (!!left && !!right && left.length === right.length && left.every((v, i) => v === right[i]))
  );
}

function missingSchedule() {
  return new Error("A stored habit is missing its required schedule.");
}
