import { describe, expect, it } from "vitest";

import {
  assertTaskListCreationAllowed,
  assertTaskListMutationAllowed,
  type TaskListMutation,
} from "./inbox-policy";

const ordinaryMutations: TaskListMutation[] = ["update", "move", "reorder", "soft-delete", "restore"];

describe("personal Inbox policy", () => {
  it("allows only account bootstrap to create an Inbox", () => {
    expect(() => assertTaskListCreationAllowed("inbox", "account-bootstrap")).not.toThrow();
    expect(() => assertTaskListCreationAllowed("inbox", "ordinary-command")).toThrowError(
      expect.objectContaining({ reason: "INBOX_CREATION_FORBIDDEN" }),
    );
  });

  it("does not apply Inbox creation restrictions to regular lists", () => {
    expect(() => assertTaskListCreationAllowed("regular", "ordinary-command")).not.toThrow();
    expect(() => assertTaskListCreationAllowed("regular", "account-bootstrap")).not.toThrow();
  });

  for (const mutation of ordinaryMutations) {
    it(`rejects Inbox ${mutation}`, () => {
      expect(() => assertTaskListMutationAllowed("inbox", mutation)).toThrowError(
        expect.objectContaining({ reason: "INBOX_IMMUTABLE" }),
      );
    });

    it(`allows regular-list ${mutation}`, () => {
      expect(() => assertTaskListMutationAllowed("regular", mutation)).not.toThrow();
    });
  }
});
