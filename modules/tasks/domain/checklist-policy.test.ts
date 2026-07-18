import { describe, expect, it } from "vitest";

import { decideChecklistCompletion } from "./checklist-policy";

describe("checklist completion policy", () => {
  it.each([
    [false, true, true],
    [true, false, true],
    [false, false, false],
    [true, true, false],
  ])("changes %s to %s independently from task status", (current, requested, changed) => {
    expect(decideChecklistCompletion(current, requested)).toEqual({
      isCompleted: requested,
      changed,
      parentTaskTransition: null,
    });
  });
});
