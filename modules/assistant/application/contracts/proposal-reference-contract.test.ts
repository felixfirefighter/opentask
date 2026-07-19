import { describe, expect, it } from "vitest";

import { PLANNER_SCHEMA_VERSION } from "./contract-primitives";
import { plannerProposalSchema } from "./proposal-contract";
import { plannerProposalSubjectsSchema } from "./proposal-subject-contract";

const taskId = "11111111-1111-4111-8111-111111111111";
const otherTaskId = "22222222-2222-4222-8222-222222222222";
const scheduleActionId = "33333333-3333-4333-8333-333333333333";
const otherActionId = "44444444-4444-4444-8444-444444444444";

function selectedSubject(semanticRef = "selected-1", id = taskId) {
  return { semanticRef, title: "Review launch", source: "selected_task", taskId: id } as const;
}

function scheduleAction(semanticRef = "selected-1", id = taskId) {
  return {
    actionId: scheduleActionId,
    kind: "schedule",
    semanticRef,
    taskId: id,
    before: null,
    after: {
      kind: "timed",
      startAt: "2026-07-20T01:00:00.000Z",
      endAt: "2026-07-20T01:30:00.000Z",
      timeZone: "Asia/Singapore",
    },
    rationale: "It fits the work window.",
    uncertainties: [],
  } as const;
}

function baseProposal() {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    planningDate: "2026-07-20",
    summary: "Review the launch.",
    subjects: [selectedSubject()],
    actions: [scheduleAction()],
    overflow: [],
    conflicts: [],
    uncertainties: [],
  } as const;
}

describe("proposal subject dictionary", () => {
  it("is bounded, strict, unique, and correlates source/ref/task identity", () => {
    const oneHundredOneDistinctSubjects = [
      ...Array.from({ length: 50 }, (_, index) => ({
        semanticRef: `selected-${index + 1}`,
        title: `Selected task ${index + 1}`,
        source: "selected_task",
        taskId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })),
      ...Array.from({ length: 51 }, (_, index) => ({
        semanticRef: `new-${index + 1}`,
        title: `New task ${index + 1}`,
        source: "brain_dump",
        taskId: null,
      })),
    ];

    expect(plannerProposalSubjectsSchema.safeParse([selectedSubject()]).success).toBe(true);
    expect(
      plannerProposalSubjectsSchema.safeParse([{ ...selectedSubject(), descriptionMd: "private" }]).success,
    ).toBe(false);
    expect(
      plannerProposalSubjectsSchema.safeParse([
        { semanticRef: "new-1", title: "Draft brief", source: "selected_task", taskId },
      ]).success,
    ).toBe(false);
    expect(
      plannerProposalSubjectsSchema.safeParse([
        selectedSubject("selected-1", taskId),
        selectedSubject("selected-2", taskId),
      ]).success,
    ).toBe(false);
    expect(plannerProposalSubjectsSchema.safeParse(oneHundredOneDistinctSubjects).success).toBe(false);
  });

  it("keeps defer-, overflow-, and conflict-only new items reviewable", () => {
    expect(
      plannerProposalSchema.safeParse({
        ...baseProposal(),
        subjects: [
          { semanticRef: "new-1", title: "Clarify brief", source: "brain_dump", taskId: null },
          { semanticRef: "new-2", title: "Draft launch", source: "brain_dump", taskId: null },
          { semanticRef: "new-3", title: "Book studio", source: "brain_dump", taskId: null },
        ],
        actions: [
          {
            actionId: scheduleActionId,
            kind: "defer",
            semanticRef: "new-1",
            taskId: null,
            rationale: "The owner is unclear.",
            uncertainties: ["Confirm who owns the brief."],
          },
        ],
        overflow: [{ semanticRef: "new-2", reason: "NO_FREE_INTERVAL" }],
        conflicts: [{ semanticRef: "new-3", code: "IMPOSSIBLE_CONSTRAINTS" }],
      }).success,
    ).toBe(true);
  });
});

describe("proposal reference correlation", () => {
  it("rejects one selected ref targeting different task IDs across actions", () => {
    expect(
      plannerProposalSchema.safeParse({
        ...baseProposal(),
        actions: [
          scheduleAction(),
          {
            actionId: otherActionId,
            kind: "prioritize",
            semanticRef: "selected-1",
            taskId: otherTaskId,
            before: "none",
            after: "high",
            rationale: "It is important.",
            uncertainties: [],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects one task ID represented by different selected refs", () => {
    expect(
      plannerProposalSchema.safeParse({
        ...baseProposal(),
        subjects: [selectedSubject("selected-1", taskId), selectedSubject("selected-2", taskId)],
        actions: [
          scheduleAction(),
          {
            actionId: otherActionId,
            kind: "prioritize",
            semanticRef: "selected-2",
            taskId,
            before: "none",
            after: "high",
            rationale: "It is important.",
            uncertainties: [],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["action", { actions: [scheduleAction("selected-2", otherTaskId)] }],
    ["overflow", { overflow: [{ semanticRef: "new-1", reason: "NO_FREE_INTERVAL" }] }],
    ["conflict", { conflicts: [{ semanticRef: "new-1", code: "IMPOSSIBLE_CONSTRAINTS" }] }],
  ])("rejects an unresolved %s semantic reference", (_label, patch) => {
    expect(plannerProposalSchema.safeParse({ ...baseProposal(), ...patch }).success).toBe(false);
  });

  it("requires create/update titles to correlate with their identifying subject", () => {
    expect(
      plannerProposalSchema.safeParse({
        ...baseProposal(),
        subjects: [{ semanticRef: "new-1", title: "Draft brief", source: "brain_dump", taskId: null }],
        actions: [
          {
            actionId: scheduleActionId,
            kind: "create",
            semanticRef: "new-1",
            after: {
              title: "Different title",
              descriptionMd: "",
              priority: "medium",
              schedule: null,
            },
            rationale: "It is actionable.",
            uncertainties: [],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
