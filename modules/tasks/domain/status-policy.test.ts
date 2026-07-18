import { describe, expect, it } from "vitest";

import {
  StatusTransitionError,
  taskStatusCommands,
  taskStatuses,
  transitionTaskStatus,
  type TaskStatus,
  type TaskStatusCommand,
} from "./status-policy";

const changedAt = new Date("2026-07-19T04:05:06.000Z");

const allowed = new Map<string, TaskStatus>([
  ["open:complete", "completed"],
  ["completed:undo-completion", "open"],
  ["open:cancel", "cancelled"],
  ["cancelled:restore-cancelled", "open"],
]);

describe("task status policy", () => {
  for (const status of taskStatuses) {
    for (const command of taskStatusCommands) {
      const expected = allowed.get(`${status}:${command}`);

      it(`${status} + ${command} ${expected ? `becomes ${expected}` : "is rejected"}`, () => {
        if (!expected) {
          expect(() => transitionTaskStatus(status, command, changedAt)).toThrow(StatusTransitionError);
          return;
        }

        const result = transitionTaskStatus(status, command, changedAt);
        expect(result).toEqual({ status: expected, statusChangedAt: changedAt });
        expect(result.statusChangedAt).not.toBe(changedAt);
      });
    }
  }

  it("rejects an invalid transition timestamp", () => {
    expect(() => transitionTaskStatus("open", "complete", new Date(Number.NaN))).toThrow(
      StatusTransitionError,
    );
  });

  it("keeps the command and status unions closed", () => {
    expect(taskStatuses).toEqual(["open", "completed", "cancelled"] satisfies TaskStatus[]);
    expect(taskStatusCommands).toEqual([
      "complete",
      "undo-completion",
      "cancel",
      "restore-cancelled",
    ] satisfies TaskStatusCommand[]);
  });
});
