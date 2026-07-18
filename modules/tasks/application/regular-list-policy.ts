import { staleTaskResource, taskConflict, taskResourceNotFound } from "./task-errors";
import {
  assertTaskListCreationAllowed,
  assertTaskListMutationAllowed,
  InboxPolicyError,
  type TaskListKind,
  type TaskListMutation,
} from "../domain/inbox-policy";
import type { StoredTaskList } from "../infrastructure/task-list-repository";

export function assertRegularListCreationAllowed(): void {
  assertTaskListCreationAllowed("regular", "ordinary-command");
}

export function assertMutableRegularList(
  list: StoredTaskList | null,
  expectedVersion: number,
  mutation: TaskListMutation,
): asserts list is StoredTaskList {
  assertOrdinaryMutationAllowed(list, mutation);
  if (list.deletedAt !== null) throw taskConflict("This list is in Trash.", list.version);
  if (list.version !== expectedVersion) throw staleTaskResource(list.version);
}

export function assertRestorableRegularList(
  list: StoredTaskList | null,
  expectedVersion: number,
): asserts list is StoredTaskList {
  assertOrdinaryMutationAllowed(list, "restore");
  if (list.deletedAt === null) throw taskConflict("This list is already active.", list.version);
  if (list.version !== expectedVersion) throw staleTaskResource(list.version);
}

function assertOrdinaryMutationAllowed(
  list: StoredTaskList | null,
  mutation: TaskListMutation,
): asserts list is StoredTaskList {
  if (!list) throw taskResourceNotFound();
  const kind = parseTaskListKind(list.kind);
  try {
    assertTaskListMutationAllowed(kind, mutation);
  } catch (error) {
    if (error instanceof InboxPolicyError) throw taskResourceNotFound();
    throw error;
  }
}

function parseTaskListKind(value: string): TaskListKind {
  if (value === "inbox" || value === "regular") return value;
  throw new Error("A task list has an unsupported kind.");
}
