import { describe, expect, it } from "vitest";

import {
  assertTaskParentAllowed,
  type ParentRelationshipFailure,
  type ParentTaskCandidate,
  type TaskPlacementIdentity,
} from "./parent-policy";

const child: TaskPlacementIdentity = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000010",
  listId: "00000000-0000-4000-8000-000000000100",
};

const parent: ParentTaskCandidate = {
  id: "00000000-0000-4000-8000-000000000002",
  userId: child.userId,
  listId: child.listId,
  parentTaskId: null,
  deletedAt: null,
};

describe("one-level task parent policy", () => {
  it("allows a root task and a direct subtask of an active root in the same list", () => {
    expect(() => assertTaskParentAllowed(child, null)).not.toThrow();
    expect(() => assertTaskParentAllowed(child, parent)).not.toThrow();
  });

  const rejected: ReadonlyArray<
    readonly [string, TaskPlacementIdentity, ParentTaskCandidate, ParentRelationshipFailure]
  > = [
    ["self-parenting", child, { ...parent, id: child.id }, "SELF_PARENT"],
    [
      "a deleted parent",
      child,
      { ...parent, deletedAt: new Date("2026-07-19T00:00:00.000Z") },
      "PARENT_DELETED",
    ],
    ["a second subtask level", child, { ...parent, parentTaskId: "root-task" }, "PARENT_IS_SUBTASK"],
    ["a different owner", child, { ...parent, userId: "another-user" }, "OWNER_MISMATCH"],
    ["a different list", child, { ...parent, listId: "another-list" }, "LIST_MISMATCH"],
  ];

  for (const [label, candidateChild, candidateParent, reason] of rejected) {
    it(`rejects ${label}`, () => {
      expect(() => assertTaskParentAllowed(candidateChild, candidateParent)).toThrowError(
        expect.objectContaining({ reason }),
      );
    });
  }
});
