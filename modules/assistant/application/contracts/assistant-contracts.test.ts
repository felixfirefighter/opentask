import { describe, expect, it } from "vitest";

import {
  PLANNER_SCHEMA_VERSION,
  modelExtractionSchema,
  plannerActionSchema,
  plannerExtractionRequestSchema,
  plannerInputSchema,
  plannerProposalSchema,
  plannerScheduleSchema,
  plannerSelectionSchema,
  proposalContextVersionsSchema,
  validateExtractionReferences,
} from "./index";

const taskId = "11111111-1111-4111-8111-111111111111";
const actionId = "22222222-2222-4222-8222-222222222222";

function extractionRequest() {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    brainDump: "Prepare the launch notes",
    planningDate: "2026-07-20",
    timeZone: "Asia/Singapore",
    workWindow: { start: "09:00", end: "17:00" },
    defaultDurationMinutes: 30,
    bufferMinutes: 10,
    selectedTasks: [{ semanticRef: "selected-1", title: "Review launch", priority: "high" }],
  } as const;
}

function modelExtraction() {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    disposition: "actionable",
    summary: "Prepare and review the launch.",
    tasks: [
      {
        source: { kind: "selected_task", semanticRef: "selected-1" },
        title: "Review launch",
        detail: null,
        estimateMinutes: 30,
        priority: "high",
        timing: { kind: "flexible", earliestStart: null, deadline: null },
        constraints: [],
        uncertainties: [],
        rationale: "It is selected and actionable.",
      },
    ],
    uncertainties: [],
  } as const;
}

function scheduleAction() {
  return {
    actionId,
    kind: "schedule",
    semanticRef: "selected-1",
    taskId,
    before: null,
    after: {
      kind: "timed",
      startAt: "2026-07-20T01:00:00.000Z",
      endAt: "2026-07-20T01:30:00.000Z",
      timeZone: "Asia/Singapore",
    },
    rationale: "Fits the work window.",
    uncertainties: [],
  } as const;
}

function proposal() {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    planningDate: "2026-07-20",
    planningContext: {
      timeZone: "Asia/Singapore",
      workWindow: { start: "09:00", end: "17:00" },
      defaultDurationMinutes: 30,
      bufferMinutes: 10,
    },
    summary: "One selected task is scheduled.",
    subjects: [
      {
        semanticRef: "selected-1",
        title: "Review launch",
        source: "selected_task",
        taskId,
      },
    ],
    actions: [scheduleAction()],
    overflow: [],
    conflicts: [],
    uncertainties: [],
  } as const;
}

describe("planner input and provider context contracts", () => {
  it("accepts a bounded strict input and rejects unknown or duplicate task identifiers", () => {
    const valid = {
      brainDump: "Plan launch",
      selectedTaskIds: [taskId],
      planningDate: "2026-07-20",
      timeZone: "Asia/Singapore",
      workWindow: { start: "09:00", end: "17:00" },
      defaultDurationMinutes: 30,
      bufferMinutes: 10,
    };
    expect(plannerInputSchema.safeParse(valid).success).toBe(true);
    expect(plannerInputSchema.safeParse({ ...valid, selectedTaskIds: [taskId, taskId] }).success).toBe(false);
    expect(plannerInputSchema.safeParse({ ...valid, userId: taskId }).success).toBe(false);
    expect(plannerInputSchema.safeParse({ ...valid, brainDump: "", selectedTaskIds: [] }).success).toBe(
      false,
    );
  });

  it("permits only ephemeral selected references and never accepts database IDs as model refs", () => {
    expect(plannerExtractionRequestSchema.safeParse(extractionRequest()).success).toBe(true);
    expect(
      plannerExtractionRequestSchema.safeParse({
        ...extractionRequest(),
        selectedTasks: [{ semanticRef: taskId, title: "Review launch", priority: "high" }],
      }).success,
    ).toBe(false);
    expect(
      plannerExtractionRequestSchema.safeParse({
        ...extractionRequest(),
        selectedTasks: [extractionRequest().selectedTasks[0], extractionRequest().selectedTasks[0]],
      }).success,
    ).toBe(false);
  });
});

describe("model extraction contract", () => {
  it("accepts strict task intent and validates selected references against the request", () => {
    const request = plannerExtractionRequestSchema.parse(extractionRequest());
    const output = modelExtractionSchema.parse(modelExtraction());
    expect(validateExtractionReferences(request, output)).toBe(true);

    const unknown = modelExtractionSchema.parse({
      ...modelExtraction(),
      tasks: [
        {
          ...modelExtraction().tasks[0],
          source: { kind: "selected_task", semanticRef: "selected-2" },
        },
      ],
    });
    expect(validateExtractionReferences(request, unknown)).toBe(false);
  });

  it("rejects irrelevant hallucinations, duplicate refs, unknown fields, and impossible timing", () => {
    expect(modelExtractionSchema.safeParse({ ...modelExtraction(), disposition: "irrelevant" }).success).toBe(
      false,
    );
    expect(
      modelExtractionSchema.safeParse({
        ...modelExtraction(),
        tasks: [modelExtraction().tasks[0], modelExtraction().tasks[0]],
      }).success,
    ).toBe(false);
    expect(modelExtractionSchema.safeParse({ ...modelExtraction(), command: "delete" }).success).toBe(false);
    expect(
      modelExtractionSchema.safeParse({
        ...modelExtraction(),
        tasks: [
          {
            ...modelExtraction().tasks[0],
            timing: {
              kind: "fixed",
              start: { date: "2026-07-20", time: "11:00" },
              end: { date: "2026-07-20", time: "10:00" },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects recurrence creation or editing from model output", () => {
    expect(
      modelExtractionSchema.safeParse({
        ...modelExtraction(),
        tasks: [
          {
            ...modelExtraction().tasks[0],
            recurrence: { preset: "daily", interval: 1 },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("versioned proposal contracts", () => {
  it("accepts only the five reviewable action types and canonical schedule shapes", () => {
    expect(plannerProposalSchema.safeParse(proposal()).success).toBe(true);
    expect(
      plannerActionSchema.safeParse({ ...scheduleAction(), kind: "delete", after: undefined }).success,
    ).toBe(false);
    expect(
      plannerScheduleSchema.safeParse({
        kind: "timed",
        startAt: "2026-07-20T02:00:00.000Z",
        endAt: "2026-07-20T01:00:00.000Z",
        timeZone: "Asia/Singapore",
      }).success,
    ).toBe(false);
    expect(
      plannerScheduleSchema.safeParse({
        kind: "timed",
        startAt: "2026-07-20T09:00:00+08:00",
        endAt: "2026-07-20T01:00:00Z",
        timeZone: "Asia/Singapore",
      }).success,
    ).toBe(true);
    expect(
      plannerScheduleSchema.safeParse({
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-20",
      }).success,
    ).toBe(false);
    expect(
      plannerActionSchema.safeParse({
        actionId,
        kind: "defer",
        semanticRef: "selected-1",
        taskId: null,
        rationale: "Wait for clarification.",
        uncertainties: ["The owner is unclear."],
      }).success,
    ).toBe(false);
    expect(
      plannerActionSchema.safeParse({
        actionId,
        kind: "defer",
        semanticRef: "new-1",
        taskId,
        rationale: "Wait for clarification.",
        uncertainties: ["The owner is unclear."],
      }).success,
    ).toBe(false);
  });

  it("cannot encode recurrence creation or editing as a review action", () => {
    expect(
      plannerActionSchema.safeParse({
        actionId,
        kind: "edit_recurrence",
        semanticRef: "selected-1",
        taskId,
        after: { preset: "daily", interval: 1 },
        rationale: "Repeat this every day.",
        uncertainties: [],
      }).success,
    ).toBe(false);
    expect(
      plannerActionSchema.safeParse({
        actionId,
        kind: "create",
        semanticRef: "new-1",
        after: {
          title: "Daily review",
          descriptionMd: "",
          priority: "none",
          schedule: null,
          recurrence: { preset: "daily", interval: 1 },
        },
        rationale: "Review each day.",
        uncertainties: [],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate action identities/kinds and unknown persisted fields", () => {
    expect(
      plannerProposalSchema.safeParse({
        ...proposal(),
        actions: [scheduleAction(), scheduleAction()],
      }).success,
    ).toBe(false);
    expect(plannerProposalSchema.safeParse({ ...proposal(), rawBrainDump: "secret" }).success).toBe(false);
    expect(
      plannerProposalSchema.safeParse({
        ...proposal(),
        planningContext: { ...proposal().planningContext, brainDump: "secret" },
      }).success,
    ).toBe(false);
    expect(
      plannerProposalSchema.safeParse({
        ...proposal(),
        planningContext: {
          ...proposal().planningContext,
          workWindow: { start: "17:00", end: "09:00" },
        },
      }).success,
    ).toBe(false);
    expect(
      plannerProposalSchema.safeParse({
        ...proposal(),
        subjects: [
          {
            semanticRef: "new-1",
            title: "Draft brief",
            source: "brain_dump",
            taskId: null,
          },
        ],
        actions: [
          {
            actionId,
            kind: "create",
            semanticRef: "new-1",
            after: { title: "Draft brief", descriptionMd: "", priority: "medium", schedule: null },
            rationale: "The brief is actionable.",
            uncertainties: [],
          },
          {
            actionId: "77777777-7777-4777-8777-777777777777",
            kind: "defer",
            semanticRef: "new-1",
            taskId: null,
            rationale: "Wait for details.",
            uncertainties: [],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("bounds context versions and selected edits", () => {
    expect(proposalContextVersionsSchema.safeParse({ [taskId]: 3 }).success).toBe(true);
    const tooMany = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        1,
      ]),
    );
    expect(proposalContextVersionsSchema.safeParse(tooMany).success).toBe(false);
    expect(
      proposalContextVersionsSchema.safeParse({
        "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA": 1,
      }).success,
    ).toBe(false);

    const selection = {
      proposalId: "33333333-3333-4333-8333-333333333333",
      applyToken: "44444444-4444-4444-8444-444444444444",
      actions: [scheduleAction(), scheduleAction()],
    };
    expect(plannerSelectionSchema.safeParse(selection).success).toBe(false);
  });
});
