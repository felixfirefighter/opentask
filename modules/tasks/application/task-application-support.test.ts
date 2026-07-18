import { describe, expect, it } from "vitest";

import { decideTaskStatus, planTaskRank, sameTaskRankScope, taskRankScope } from "./task-application-support";

describe("task application support", () => {
  it("maps only the four approved status transitions", () => {
    const changedAt = new Date("2026-07-19T01:02:03.000Z");
    expect(decideTaskStatus("open", "completed", changedAt, 7)).toEqual({
      status: "completed",
      statusChangedAt: changedAt,
    });
    expect(() => decideTaskStatus("completed", "cancelled", changedAt, 7)).toThrow(
      expect.objectContaining({ code: "CONFLICT", currentVersion: 7 }),
    );
    expect(() => decideTaskStatus("open", "open", changedAt, 7)).toThrow(
      expect.objectContaining({ code: "CONFLICT", currentVersion: 7 }),
    );
  });

  it("keeps root and subtask rank scopes distinct", () => {
    const root = taskRankScope({ listId: "list", sectionId: "section", parentTaskId: null });
    const subtask = taskRankScope({ listId: "list", sectionId: "section", parentTaskId: "parent" });
    expect(root).toEqual({ kind: "root", listId: "list", sectionId: "section" });
    expect(subtask).toEqual({ kind: "subtask", listId: "list", parentTaskId: "parent" });
    expect(sameTaskRankScope(root, subtask)).toBe(false);
    expect(sameTaskRankScope(root, { ...root })).toBe(true);
  });

  it("maps malformed or exhausted rank neighbors to a stable safe conflict", () => {
    expect(() =>
      planTaskRank([{ id: "neighbor", rank: "not-a-rank!", version: 1 }], "target", {
        kind: "end",
      }),
    ).toThrow(
      expect.objectContaining({
        code: "CONFLICT",
        message: "The requested position is no longer available. Refresh and try again.",
      }),
    );
  });
});
