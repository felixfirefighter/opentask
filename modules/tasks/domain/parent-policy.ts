export type TaskPlacementIdentity = Readonly<{
  id: string;
  userId: string;
  listId: string;
}>;

export type ParentTaskCandidate = TaskPlacementIdentity &
  Readonly<{
    parentTaskId: string | null;
    deletedAt: Date | null;
  }>;

export type ParentRelationshipFailure =
  "SELF_PARENT" | "PARENT_DELETED" | "PARENT_IS_SUBTASK" | "OWNER_MISMATCH" | "LIST_MISMATCH";

export class ParentRelationshipError extends Error {
  readonly reason: ParentRelationshipFailure;

  constructor(reason: ParentRelationshipFailure) {
    super("The requested parent task relationship is not allowed.");
    this.name = "ParentRelationshipError";
    this.reason = reason;
  }
}

export function assertTaskParentAllowed(
  child: TaskPlacementIdentity,
  parent: ParentTaskCandidate | null,
): void {
  if (parent === null) return;
  if (child.id === parent.id) throw new ParentRelationshipError("SELF_PARENT");
  if (parent.deletedAt !== null) throw new ParentRelationshipError("PARENT_DELETED");
  if (parent.parentTaskId !== null) throw new ParentRelationshipError("PARENT_IS_SUBTASK");
  if (child.userId !== parent.userId) throw new ParentRelationshipError("OWNER_MISMATCH");
  if (child.listId !== parent.listId) throw new ParentRelationshipError("LIST_MISMATCH");
}
