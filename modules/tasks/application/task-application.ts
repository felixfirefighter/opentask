import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  createTaskWithScheduleRequestSchema,
  createTaskRequestSchema,
  entityIdSchema,
  taskDetailDtoSchema,
  taskPageSchema,
  taskQuerySchema,
  transitionTaskStatusRequestSchema,
  updateTaskRequestSchema,
  type CreateTaskRequest,
  type CreateTaskWithScheduleRequest,
  type TaskDetailDto,
  type TaskDto,
  type TaskPage,
  type TaskQuery,
  type TaskScheduleValue,
  type TaskWithScheduleDto,
  type TransitionTaskStatusRequest,
  type UpdateTaskRequest,
} from "./contracts";
import { decodeRankCursor, pageFromRows } from "./page-cursor";
import {
  applyTaskSiblingRebalance,
  assertActiveContainers,
  assertAllowedPlacement,
  assertEquivalentTaskReplay,
  assertMutableTask,
  decideTaskStatus,
  loadAllowedParent,
  mapChecklistItem,
  mapTag,
  mapTask,
  planLockedTaskRank,
  requireAppliedTask,
  taskRankScope,
} from "./task-application-support";
import { createTaskLifecycleCommands } from "./task-lifecycle-commands";
import { mapSchedule, toScheduleWrite } from "./schedule-application";
import { createTerminalTaskQuery } from "./terminal-task-query";
import { taskConflict, taskResourceNotFound } from "./task-errors";
import { mapTaskListItems } from "./task-list-item-projection";
import { createTaskRecurrenceLifecycle } from "./task-recurrence-lifecycle";
import { normalizeTaskTitle, validateTaskDescription } from "../domain/task-text";
import { createChecklistRepository } from "../infrastructure/checklist-repository";
import { createSectionRepository } from "../infrastructure/section-repository";
import { createTagRepository } from "../infrastructure/tag-repository";
import { createTaskRepository, type StoredTask } from "../infrastructure/task-repository";
import { createTaskRecurrenceRepository } from "../infrastructure/task-recurrence-repository";
import {
  createTaskScheduleRepository,
  type StoredTaskSchedule,
} from "../infrastructure/task-schedule-repository";
import { createTaskListRepository } from "../infrastructure/task-list-repository";
import { RruleRecurrenceExpander } from "../infrastructure/recurrence/rrule-expander";
import type { TaskScheduleTable } from "../infrastructure/schema";

export type TaskCreateResult = Readonly<{ created: boolean; value: TaskDto }>;
export type TaskWithScheduleCreateResult = Readonly<{
  created: boolean;
  value: TaskWithScheduleDto;
}>;

export function createTaskApplication({
  database,
  clock,
  taskSchedules,
}: {
  database: Database;
  clock: Clock;
  taskSchedules: TaskScheduleTable;
}) {
  const tasks = createTaskRepository(database);
  const lists = createTaskListRepository(database);
  const sections = createSectionRepository(database);
  const checklist = createChecklistRepository(database);
  const tags = createTagRepository(database);
  const schedules = createTaskScheduleRepository(taskSchedules, database);
  const recurrences = createTaskRecurrenceRepository(database);
  const recurrenceLifecycle = createTaskRecurrenceLifecycle({
    database,
    expansion: new RruleRecurrenceExpander(),
    taskSchedules,
  });
  const placementRepositories = { tasks, lists, sections };
  const lifecycleCommands = createTaskLifecycleCommands({ database, clock, recurrenceLifecycle });
  const terminalQuery = createTerminalTaskQuery({ database });

  async function createTaskInTransaction(
    actor: AuthenticatedActor,
    resourceId: string,
    input: CreateTaskRequest,
    transaction: DatabaseTransaction,
  ): Promise<TaskCreateResult> {
    const canonical = {
      listId: input.listId,
      sectionId: input.sectionId,
      parentTaskId: input.parentTaskId,
      title: normalizeTaskTitle(input.title),
      descriptionMd: validateTaskDescription(input.descriptionMd),
      priority: input.priority,
    };
    const replay = await tasks.lockById(actor.userId, resourceId, "any", transaction);
    if (replay) return taskReplay(replay, canonical);
    await assertActiveContainers(
      placementRepositories,
      actor.userId,
      canonical.listId,
      canonical.sectionId,
      transaction,
      true,
    );
    const scope = taskRankScope(canonical);
    const planned = await planLockedTaskRank(
      transaction,
      tasks,
      actor.userId,
      scope,
      resourceId,
      input.placement,
    );
    await loadAllowedParent(
      placementRepositories,
      actor.userId,
      { id: resourceId, listId: canonical.listId },
      canonical.parentTaskId,
      transaction,
      true,
    );
    const existing = await tasks.lockById(actor.userId, resourceId, "any", transaction);
    if (existing) return taskReplay(existing, canonical);
    const now = clock.now();
    await applyTaskSiblingRebalance(tasks, actor.userId, scope, planned, resourceId, now, transaction);
    const created = await tasks.insert(
      { id: resourceId, userId: actor.userId, ...canonical, rank: planned.plan.rank, now },
      transaction,
    );
    if (!created) {
      const collision = await tasks.lockById(actor.userId, resourceId, "any", transaction);
      if (collision) return taskReplay(collision, canonical);
      throw taskConflict("This create key was already used for different task data.");
    }
    return { created: true, value: mapTask(created) };
  }

  return {
    async listTasks(actor: AuthenticatedActor, rawQuery: TaskQuery): Promise<TaskPage> {
      const query = taskQuerySchema.parse(rawQuery);
      await assertActiveContainers(
        placementRepositories,
        actor.userId,
        query.listId,
        query.sectionId ?? null,
        database,
      );
      if (query.parentTaskId !== null) {
        await assertAllowedPlacement(
          placementRepositories,
          actor.userId,
          { id: "task-query", listId: query.listId },
          query.sectionId ?? null,
          query.parentTaskId,
          database,
        );
      }
      const after = decodeRankCursor(query.cursor);
      const rows = await tasks.listActivePage(actor.userId, {
        listId: query.listId,
        parentTaskId: query.parentTaskId,
        status: query.status,
        limit: query.limit + 1,
        ...(query.sectionId === undefined ? {} : { sectionId: query.sectionId }),
        ...(after ? { after } : {}),
      });
      const page = pageFromRows(rows, query.limit);
      const pageTaskIds = page.items.map(({ id }) => id);
      const [taskTags, pageRecurrences] = await Promise.all([
        tags.listActiveForTasks(actor.userId, pageTaskIds),
        recurrences.listForTaskIds(actor.userId, pageTaskIds),
      ]);
      return taskPageSchema.parse({
        items: mapTaskListItems(page.items, taskTags, pageRecurrences),
        nextCursor: page.nextCursor,
      });
    },

    async getTask(actor: AuthenticatedActor, rawTaskId: string): Promise<TaskDetailDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const task = await tasks.findById(actor.userId, taskId, "active");
      if (!task) throw taskResourceNotFound();
      const [items, taskTags, subtasks] = await Promise.all([
        checklist.listByTask(actor.userId, taskId),
        tags.listActiveForTask(actor.userId, taskId),
        tasks.listDirectSubtasks(actor.userId, taskId, "active"),
      ]);
      return taskDetailDtoSchema.parse({
        ...mapTask(task),
        checklistItems: items.map(mapChecklistItem),
        tags: taskTags.map(mapTag),
        subtasks: subtasks.map(mapTask),
      });
    },

    async createTask(
      actor: AuthenticatedActor,
      rawResourceId: string,
      rawInput: CreateTaskRequest,
    ): Promise<TaskCreateResult> {
      const resourceId = entityIdSchema.parse(rawResourceId);
      const input = createTaskRequestSchema.parse(rawInput);
      return database.transaction((transaction) =>
        createTaskInTransaction(actor, resourceId, input, transaction),
      );
    },

    async createTaskWithSchedule(
      actor: AuthenticatedActor,
      rawResourceId: string,
      rawInput: CreateTaskWithScheduleRequest,
    ): Promise<TaskWithScheduleCreateResult> {
      const resourceId = entityIdSchema.parse(rawResourceId);
      const input = createTaskWithScheduleRequestSchema.parse(rawInput);
      const { schedule, ...taskInput } = input;
      const scheduleWrite = toScheduleWrite(schedule);
      return database.transaction(async (transaction) => {
        const result = await createTaskInTransaction(actor, resourceId, taskInput, transaction);
        const storedSchedule = result.created
          ? await schedules.upsert(
              {
                userId: actor.userId,
                taskId: resourceId,
                schedule: scheduleWrite,
                now: clock.now(),
              },
              transaction,
            )
          : await requireEquivalentScheduleReplay(schedules, actor.userId, resourceId, schedule, transaction);
        return {
          created: result.created,
          value: { task: result.value, schedule: mapSchedule(storedSchedule) },
        };
      });
    },

    async updateTask(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: UpdateTaskRequest,
    ): Promise<TaskDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = updateTaskRequestSchema.parse(rawInput);
      const patch = {
        ...(input.patch.title === undefined ? {} : { title: normalizeTaskTitle(input.patch.title) }),
        ...(input.patch.descriptionMd === undefined
          ? {}
          : { descriptionMd: validateTaskDescription(input.patch.descriptionMd) }),
        ...(input.patch.priority === undefined ? {} : { priority: input.patch.priority }),
      };
      return database.transaction(async (transaction) => {
        const current = await tasks.lockById(actor.userId, taskId, "any", transaction);
        assertMutableTask(current, input.expectedVersion);
        return mapTask(
          requireAppliedTask(
            await tasks.updateDetails(
              {
                userId: actor.userId,
                id: taskId,
                expectedVersion: input.expectedVersion,
                patch,
                now: clock.now(),
              },
              transaction,
            ),
          ),
        );
      });
    },

    async transitionTaskStatus(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: TransitionTaskStatusRequest,
    ): Promise<TaskDto> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = transitionTaskStatusRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await tasks.lockById(actor.userId, taskId, "any", transaction);
        assertMutableTask(current, input.expectedVersion);
        const now = clock.now();
        const transition = decideTaskStatus(current.status, input.status, now, current.version);
        const recurrenceResources = await recurrenceLifecycle.lockResources(
          actor.userId,
          taskId,
          transaction,
        );
        if (input.status === "completed") {
          recurrenceLifecycle.assertCompletionAllowed(recurrenceResources.recurrence, current.version);
        }
        if (current.status === "cancelled" && input.status === "open") {
          await recurrenceLifecycle.advanceForResume(actor.userId, recurrenceResources, now, transaction);
        }
        return mapTask(
          requireAppliedTask(
            await tasks.updateStatus(
              {
                userId: actor.userId,
                id: taskId,
                expectedVersion: input.expectedVersion,
                ...transition,
                now,
              },
              transaction,
            ),
          ),
        );
      });
    },

    ...lifecycleCommands,
    ...terminalQuery,
  };
}

function taskReplay(
  task: StoredTask,
  canonical: Pick<
    StoredTask,
    "listId" | "sectionId" | "parentTaskId" | "title" | "descriptionMd" | "priority"
  >,
): TaskCreateResult {
  assertEquivalentTaskReplay(task, canonical);
  return { created: false, value: mapTask(task) };
}

async function requireEquivalentScheduleReplay(
  schedules: ReturnType<typeof createTaskScheduleRepository>,
  userId: string,
  taskId: string,
  requested: TaskScheduleValue,
  transaction: DatabaseTransaction,
): Promise<StoredTaskSchedule> {
  const current = await schedules.findByTaskId(userId, taskId, transaction);
  if (!current || !sameSchedule(current, requested)) {
    throw taskConflict("This create key was already used for different task or schedule data.");
  }
  return current;
}

function sameSchedule(current: StoredTaskSchedule, requested: TaskScheduleValue): boolean {
  if (current.kind !== requested.kind) return false;
  if (requested.kind === "all_day") {
    return current.startDate === requested.startDate && current.endDate === requested.endDate;
  }
  return (
    current.startAt?.getTime() === new Date(requested.startAt).getTime() &&
    current.endAt?.getTime() === new Date(requested.endAt).getTime() &&
    current.timezone === requested.timezone
  );
}
