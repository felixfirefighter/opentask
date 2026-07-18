import type { DatabaseExecutor } from "@/shared/db/client";

import {
  checklistItemDtoSchema,
  tagDtoSchema,
  taskDtoSchema,
  taskStatusSchema,
  type ChecklistItemDto,
  type Placement,
  type TagDto,
  type TaskDto,
  type TaskStatus,
} from "./contracts";
import { siblingRebalance } from "./rank-operation";
import { planRankPlacement, RankPlacementError, type RankPlacementPlan } from "./ranked-placement";
import { RankPolicyError } from "./ranking";
import { staleTaskResource, taskConflict, taskResourceNotFound } from "./task-errors";
import { assertTaskParentAllowed, ParentRelationshipError } from "../domain/parent-policy";
import {
  transitionTaskStatus,
  type TaskStatusCommand,
  type TaskStatusTransition,
} from "../domain/status-policy";
import type { StoredChecklistItem } from "../infrastructure/checklist-repository";
import { lockRankScope } from "../infrastructure/rank-scope-lock";
import type { createSectionRepository } from "../infrastructure/section-repository";
import type { StoredTag } from "../infrastructure/tag-repository";
import type {
  StoredTask,
  TaskRankScope,
  TaskWriteResult,
  createTaskRepository,
} from "../infrastructure/task-repository";
import type { createTaskListRepository } from "../infrastructure/task-list-repository";

type TaskRepository = ReturnType<typeof createTaskRepository>;
type ListRepository = ReturnType<typeof createTaskListRepository>;
type SectionRepository = ReturnType<typeof createSectionRepository>;
type PlacementRepositories = Readonly<{
  tasks: TaskRepository;
  lists: ListRepository;
  sections: SectionRepository;
}>;

export type PlannedTaskRank = Readonly<{
  plan: RankPlacementPlan;
  siblings: readonly { id: string; rank: string; version: number }[];
}>;

export function taskRankScope(task: Pick<StoredTask, "listId" | "sectionId" | "parentTaskId">) {
  return task.parentTaskId === null
    ? ({ kind: "root", listId: task.listId, sectionId: task.sectionId } satisfies TaskRankScope)
    : ({ kind: "subtask", listId: task.listId, parentTaskId: task.parentTaskId } satisfies TaskRankScope);
}

export function taskRankLockScope(userId: string, scope: TaskRankScope): readonly [string, ...string[]] {
  return scope.kind === "root"
    ? ["task-root", userId, scope.listId, scope.sectionId ?? "none"]
    : ["task-subtask", userId, scope.listId, scope.parentTaskId];
}

export function sameTaskRankScope(left: TaskRankScope, right: TaskRankScope): boolean {
  return (
    left.kind === right.kind &&
    left.listId === right.listId &&
    (left.kind === "root"
      ? right.kind === "root" && left.sectionId === right.sectionId
      : right.kind === "subtask" && left.parentTaskId === right.parentTaskId)
  );
}

export async function planLockedTaskRank(
  executor: DatabaseExecutor,
  repository: TaskRepository,
  userId: string,
  scope: TaskRankScope,
  targetId: string,
  placement: Placement,
): Promise<PlannedTaskRank> {
  await lockRankScope(executor, taskRankLockScope(userId, scope));
  const siblings = await repository.listActiveRankScope(userId, scope, executor);
  return planTaskRank(siblings, targetId, placement);
}

export function planTaskRank(
  siblings: readonly { id: string; rank: string; version: number }[],
  targetId: string,
  placement: Placement,
): PlannedTaskRank {
  try {
    return { plan: planRankPlacement(siblings, targetId, placement), siblings };
  } catch (error) {
    if (error instanceof RankPlacementError || error instanceof RankPolicyError) {
      throw taskConflict("The requested position is no longer available. Refresh and try again.");
    }
    throw error;
  }
}

export async function applyTaskSiblingRebalance(
  repository: TaskRepository,
  userId: string,
  scope: TaskRankScope,
  planned: PlannedTaskRank,
  targetId: string,
  now: Date,
  executor: DatabaseExecutor,
): Promise<void> {
  const versions = new Map(planned.siblings.map((row) => [row.id, row.version]));
  const updates = siblingRebalance(planned.plan, targetId).map(({ id, rank }) => {
    const expectedVersion = versions.get(id);
    if (expectedVersion === undefined) throw new Error("Rank plan referenced an unknown task sibling.");
    return { id, rank, expectedVersion };
  });
  if (updates.length === 0) return;
  const results = await repository.rewriteRanks(userId, scope, updates, now, executor);
  for (const result of results) requireAppliedTask(result);
}

export async function assertActiveContainers(
  repositories: PlacementRepositories,
  userId: string,
  listId: string,
  sectionId: string | null,
  executor: DatabaseExecutor,
  lock = false,
): Promise<void> {
  const list = lock
    ? await repositories.lists.lockById(userId, listId, executor)
    : await repositories.lists.findActiveById(userId, listId, executor);
  if (!list || list.deletedAt !== null) throw taskResourceNotFound();
  const section =
    sectionId === null
      ? null
      : lock
        ? await repositories.sections.lockById(userId, listId, sectionId, executor)
        : await repositories.sections.findById(userId, listId, sectionId, executor);
  if (sectionId !== null && !section) {
    throw taskResourceNotFound();
  }
}

export async function assertAllowedPlacement(
  repositories: PlacementRepositories,
  userId: string,
  child: Pick<StoredTask, "id" | "listId">,
  sectionId: string | null,
  parentTaskId: string | null,
  executor: DatabaseExecutor,
  lock = false,
): Promise<StoredTask | null> {
  await assertActiveContainers(repositories, userId, child.listId, sectionId, executor, lock);
  return loadAllowedParent(repositories, userId, child, parentTaskId, executor, lock);
}

export async function loadAllowedParent(
  repositories: PlacementRepositories,
  userId: string,
  child: Pick<StoredTask, "id" | "listId">,
  parentTaskId: string | null,
  executor: DatabaseExecutor,
  lock = false,
): Promise<StoredTask | null> {
  const parent = parentTaskId
    ? lock
      ? await repositories.tasks.lockById(userId, parentTaskId, "active", executor)
      : await repositories.tasks.findById(userId, parentTaskId, "active", executor)
    : null;
  if (parentTaskId !== null && !parent) throw taskResourceNotFound();
  assertAllowedParent({ id: child.id, userId, listId: child.listId }, parent);
  return parent;
}

export function assertAllowedParent(
  child: Pick<StoredTask, "id" | "userId" | "listId">,
  parent: StoredTask | null,
): void {
  try {
    assertTaskParentAllowed(child, parent);
  } catch (error) {
    if (error instanceof ParentRelationshipError) {
      throw taskConflict("The requested parent would violate the one-level subtask rule.");
    }
    throw error;
  }
}

export function assertMutableTask(
  task: StoredTask | null,
  expectedVersion: number,
): asserts task is StoredTask {
  if (!task) throw taskResourceNotFound();
  if (task.deletedAt !== null) throw taskConflict("This task is in Trash.", task.version);
  if (task.version !== expectedVersion) throw staleTaskResource(task.version);
}

export function assertRestorableTask(
  task: StoredTask | null,
  expectedVersion: number,
): asserts task is StoredTask {
  if (!task) throw taskResourceNotFound();
  if (task.deletedAt === null) throw taskConflict("This task is already active.", task.version);
  if (task.version !== expectedVersion) throw staleTaskResource(task.version);
}

export function requireAppliedTask(result: TaskWriteResult): StoredTask {
  if (result.outcome === "applied") return result.task;
  if (result.outcome === "not-found") throw taskResourceNotFound();
  if (result.outcome === "stale") throw staleTaskResource(result.currentVersion);
  throw taskConflict("The task lifecycle changed while this request was running.", result.currentVersion);
}

export function decideTaskStatus(
  currentStatus: string,
  requestedStatus: TaskStatus,
  changedAt: Date,
  currentVersion: number,
): TaskStatusTransition {
  const current = taskStatusSchema.parse(currentStatus);
  const command = statusCommand(current, requestedStatus);
  if (!command) throw taskConflict("The requested task status transition is not allowed.", currentVersion);
  return transitionTaskStatus(current, command, changedAt);
}

function statusCommand(current: TaskStatus, requested: TaskStatus): TaskStatusCommand | null {
  if (current === "open" && requested === "completed") return "complete";
  if (current === "completed" && requested === "open") return "undo-completion";
  if (current === "open" && requested === "cancelled") return "cancel";
  if (current === "cancelled" && requested === "open") return "restore-cancelled";
  return null;
}

export function mapTask(task: StoredTask): TaskDto {
  return taskDtoSchema.parse({
    id: task.id,
    listId: task.listId,
    sectionId: task.sectionId,
    parentTaskId: task.parentTaskId,
    title: task.title,
    descriptionMd: task.descriptionMd,
    status: task.status,
    priority: task.priority,
    rank: task.rank,
    statusChangedAt: task.statusChangedAt.toISOString(),
    version: task.version,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    deletedAt: task.deletedAt?.toISOString() ?? null,
  });
}

export function mapChecklistItem(item: StoredChecklistItem): ChecklistItemDto {
  return checklistItemDtoSchema.parse({
    id: item.id,
    taskId: item.taskId,
    title: item.title,
    isCompleted: item.isCompleted,
    rank: item.rank,
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
}

export function mapTag(tag: StoredTag): TagDto {
  return tagDtoSchema.parse({
    id: tag.id,
    name: tag.name,
    colorToken: tag.colorToken,
    version: tag.version,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
    deletedAt: tag.deletedAt?.toISOString() ?? null,
  });
}

export function assertEquivalentTaskReplay(
  task: StoredTask,
  input: Pick<StoredTask, "listId" | "sectionId" | "parentTaskId" | "title" | "descriptionMd" | "priority">,
): void {
  if (
    task.deletedAt !== null ||
    task.status !== "open" ||
    task.listId !== input.listId ||
    task.sectionId !== input.sectionId ||
    task.parentTaskId !== input.parentTaskId ||
    task.title !== input.title ||
    task.descriptionMd !== input.descriptionMd ||
    task.priority !== input.priority
  ) {
    throw taskConflict("This create key was already used for different task data.");
  }
}
