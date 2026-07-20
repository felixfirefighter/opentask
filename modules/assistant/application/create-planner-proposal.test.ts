import { describe, expect, it, vi } from "vitest";

import { buildDeterministicPlan, type PlanningBusyIntervalReader } from "@/modules/planning";
import type { TasksApplication } from "@/modules/tasks";
import { ApplicationError } from "@/shared/http/application-error";

import {
  PLANNER_PROMPT_VERSION,
  PLANNER_SCHEMA_VERSION,
  plannerProposalDtoSchema,
  type ModelExtraction,
  type PlannerExtractionProvider,
  type PlannerInput,
  type PlannerProposal,
  type ProposalContextVersions,
} from "./contracts";
import type {
  PlannerProposalWriter,
  PlannerSelectedTaskReader,
  PlannerSelectedTaskSnapshot,
} from "./contracts/proposal-creation-contract";
import { createPlannerProposalCreator } from "./create-planner-proposal";
import { PlannerProviderError } from "../infrastructure/openai-responses-provider";
import type { PlannerProposalLifecycle } from "./proposal-lifecycle";

const selectedTaskPortConforms: TasksApplication["taskSnapshots"] extends PlannerSelectedTaskReader
  ? true
  : false = true;
const proposalWriterConforms: PlannerProposalLifecycle extends PlannerProposalWriter ? true : false = true;
type BusyContextTruncationReason = Awaited<
  ReturnType<PlanningBusyIntervalReader["readBusyIntervals"]>
>["truncation"]["reasons"][number];

const actor = { userId: "11111111-1111-4111-8111-111111111111" } as const;
const taskId = "22222222-2222-4222-8222-222222222222";
const secondTaskId = "88888888-8888-4888-8888-888888888888";
const proposalId = "33333333-3333-4333-8333-333333333333";
const actionIds = [
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
] as const;
const applyToken = "77777777-7777-4777-8777-777777777777";

const selectedSnapshot: PlannerSelectedTaskSnapshot = {
  id: taskId,
  title: "Review launch",
  descriptionMd: "Current notes",
  priority: "none",
  version: 7,
};

function plannerInput(patch: Partial<PlannerInput> = {}): PlannerInput {
  return {
    brainDump: "private raw planning text",
    selectedTaskIds: [taskId],
    planningDate: "2026-07-20",
    timeZone: "Asia/Singapore",
    workWindow: { start: "09:00", end: "17:00" },
    defaultDurationMinutes: 30,
    bufferMinutes: 10,
    ...patch,
  };
}

function selectedExtraction(patch: Partial<ModelExtraction> = {}): ModelExtraction {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    disposition: "actionable",
    summary: "Clarify and schedule the launch review.",
    tasks: [
      {
        source: { kind: "selected_task", semanticRef: "selected-1" },
        title: "Review launch plan",
        detail: "Current notes\n\nConfirm the final scope.",
        estimateMinutes: 30,
        priority: "high",
        timing: { kind: "flexible", earliestStart: null, deadline: null },
        constraints: [],
        uncertainties: ["The final scope may change."],
        rationale: "The selected task is ready to plan.",
      },
    ],
    uncertainties: [],
    ...patch,
  };
}

function newTaskExtraction(
  timing: ModelExtraction["tasks"][number]["timing"] = {
    kind: "flexible",
    earliestStart: null,
    deadline: null,
  },
): ModelExtraction {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    disposition: "actionable",
    summary: "Draft the launch brief.",
    tasks: [
      {
        source: { kind: "brain_dump", semanticRef: "new-1" },
        title: "Draft launch brief",
        detail: null,
        estimateMinutes: 60,
        priority: "medium",
        timing,
        constraints: [],
        uncertainties: [],
        rationale: "A concrete brief is needed.",
      },
    ],
    uncertainties: [],
  };
}

function createHarness(
  options: {
    extraction?: ModelExtraction;
    providerError?: unknown;
    snapshots?: readonly PlannerSelectedTaskSnapshot[];
    busyItems?: Awaited<ReturnType<PlanningBusyIntervalReader["readBusyIntervals"]>>["items"];
    busyTruncationReason?: BusyContextTruncationReason;
    provider?: PlannerExtractionProvider | null;
  } = {},
) {
  const requests: unknown[] = [];
  const persisted: Array<{ proposal: PlannerProposal; contextVersions: ProposalContextVersions }> = [];
  const providerCalls = vi.fn();
  const selectedCalls = vi.fn();
  const busyCalls = vi.fn();
  const provider =
    options.provider === undefined
      ? {
          async extract(request: Parameters<PlannerExtractionProvider["extract"]>[0]) {
            providerCalls();
            requests.push(request);
            if (options.providerError) throw options.providerError;
            return { extraction: options.extraction ?? selectedExtraction(), model: "gpt-5.6" };
          },
        }
      : options.provider;
  const selectedTasks: PlannerSelectedTaskReader = {
    async loadOpenUnscheduled(_actor, taskIds) {
      selectedCalls(taskIds);
      return options.snapshots ?? [selectedSnapshot];
    },
  };
  const busyIntervals: PlanningBusyIntervalReader = {
    async readBusyIntervals(_actor, query) {
      busyCalls(query);
      return {
        items: options.busyItems ?? [],
        truncation: {
          truncated: options.busyTruncationReason !== undefined,
          reasons: options.busyTruncationReason ? [options.busyTruncationReason] : [],
          recurrenceRowsEvaluated: 0,
          occurrenceEventsEvaluated: 0,
          candidateEvaluations: 0,
        },
      };
    },
  };
  const proposals: PlannerProposalWriter = {
    async persist(_actor, input) {
      persisted.push({ proposal: input.proposal, contextVersions: input.contextVersions });
      return plannerProposalDtoSchema.parse({
        id: proposalId,
        planningDate: input.proposal.planningDate,
        schemaVersion: PLANNER_SCHEMA_VERSION,
        proposal: input.proposal,
        contextVersions: input.contextVersions,
        status: "pending",
        model: input.model,
        promptVersion: input.promptVersion,
        applyToken,
        createdAt: "2026-07-19T10:00:00.000Z",
        expiresAt: "2026-07-19T10:30:00.000Z",
        appliedAt: null,
      });
    },
  };
  let nextActionId = 0;
  const schedule = vi.fn(buildDeterministicPlan);
  const creator = createPlannerProposalCreator({
    provider,
    selectedTasks,
    busyIntervals,
    proposals,
    schedule,
    createActionId: () => actionIds[nextActionId++] ?? crypto.randomUUID(),
  });

  return { creator, requests, persisted, providerCalls, selectedCalls, busyCalls, schedule };
}

describe("planner proposal creation", () => {
  it("accepts the existing task snapshot and proposal lifecycle services as adapters", () => {
    expect([selectedTaskPortConforms, proposalWriterConforms]).toEqual([true, true]);
  });

  it("authorizes selected snapshots, sends minimal semantic context, and persists a review-only diff", async () => {
    const harness = createHarness();

    const result = await harness.creator.create(actor, plannerInput());

    expect(result.status).toBe("pending");
    expect(harness.selectedCalls).toHaveBeenCalledWith([taskId]);
    expect(harness.providerCalls).toHaveBeenCalledOnce();
    expect(harness.busyCalls).toHaveBeenCalledWith({
      rangeStartDate: "2026-07-20",
      rangeEndDate: "2026-07-21",
      rangeStartAt: "2026-07-20T01:00:00Z",
      rangeEndAt: "2026-07-20T09:00:00Z",
      limit: 500,
    });
    expect(harness.requests).toEqual([
      {
        schemaVersion: PLANNER_SCHEMA_VERSION,
        brainDump: "private raw planning text",
        planningDate: "2026-07-20",
        timeZone: "Asia/Singapore",
        workWindow: { start: "09:00", end: "17:00" },
        defaultDurationMinutes: 30,
        bufferMinutes: 10,
        selectedTasks: [{ semanticRef: "selected-1", title: "Review launch", priority: "none" }],
      },
    ]);
    const serializedRequest = JSON.stringify(harness.requests[0]);
    expect(serializedRequest).not.toContain(taskId);
    expect(serializedRequest).not.toContain("Current notes");
    expect(serializedRequest).not.toContain('"version"');

    const stored = harness.persisted[0];
    expect(stored?.proposal.planningContext).toEqual({
      timeZone: "Asia/Singapore",
      workWindow: { start: "09:00", end: "17:00" },
      defaultDurationMinutes: 30,
      bufferMinutes: 10,
    });
    expect(stored?.contextVersions).toEqual({ [taskId]: 7 });
    expect(stored?.proposal.actions.map(({ kind }) => kind)).toEqual(["update", "prioritize", "schedule"]);
    expect(stored?.proposal.actions.at(-1)).toMatchObject({
      kind: "schedule",
      after: {
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T01:30:00Z",
        timeZone: "Asia/Singapore",
      },
    });
    expect(JSON.stringify(stored?.proposal)).not.toContain("private raw planning text");
    expect(result.promptVersion).toBe(PLANNER_PROMPT_VERSION);
  });

  it("creates a brain-dump task without calling the non-empty selected-task reader", async () => {
    const harness = createHarness({ extraction: newTaskExtraction(), snapshots: [] });

    await harness.creator.create(actor, plannerInput({ selectedTaskIds: [] }));

    expect(harness.selectedCalls).not.toHaveBeenCalled();
    expect(harness.persisted[0]?.contextVersions).toEqual({});
    expect(harness.persisted[0]?.proposal.actions).toEqual([
      expect.objectContaining({
        actionId: actionIds[0],
        kind: "create",
        semanticRef: "new-1",
        after: expect.objectContaining({
          title: "Draft launch brief",
          descriptionMd: "",
          priority: "medium",
        }),
      }),
    ]);
  });

  it("assigns ephemeral selected references in requested order even when the reader reorders rows", async () => {
    const secondSnapshot: PlannerSelectedTaskSnapshot = {
      id: secondTaskId,
      title: "Prepare screenshots",
      descriptionMd: "",
      priority: "low",
      version: 3,
    };
    const extraction: ModelExtraction = {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      disposition: "actionable",
      summary: "Schedule both selected tasks.",
      tasks: [
        {
          source: { kind: "selected_task", semanticRef: "selected-1" },
          title: selectedSnapshot.title,
          detail: null,
          estimateMinutes: 30,
          priority: selectedSnapshot.priority,
          timing: { kind: "flexible", earliestStart: null, deadline: null },
          constraints: [],
          uncertainties: [],
          rationale: "Schedule the first selected task.",
        },
        {
          source: { kind: "selected_task", semanticRef: "selected-2" },
          title: secondSnapshot.title,
          detail: null,
          estimateMinutes: 30,
          priority: secondSnapshot.priority,
          timing: { kind: "flexible", earliestStart: null, deadline: null },
          constraints: [],
          uncertainties: [],
          rationale: "Schedule the second selected task.",
        },
      ],
      uncertainties: [],
    };
    const harness = createHarness({
      extraction,
      snapshots: [secondSnapshot, selectedSnapshot],
    });

    await harness.creator.create(actor, plannerInput({ selectedTaskIds: [taskId, secondTaskId] }));

    expect(harness.requests[0]).toMatchObject({
      selectedTasks: [
        { semanticRef: "selected-1", title: selectedSnapshot.title },
        { semanticRef: "selected-2", title: secondSnapshot.title },
      ],
    });
    expect(harness.persisted[0]?.proposal.subjects).toMatchObject([
      { semanticRef: "selected-1", taskId },
      { semanticRef: "selected-2", taskId: secondTaskId },
    ]);
    expect(harness.persisted[0]?.contextVersions).toEqual({ [taskId]: 7, [secondTaskId]: 3 });
  });

  it("respects the content-free occurrence intervals supplied by planning", async () => {
    const harness = createHarness({
      extraction: newTaskExtraction(),
      busyItems: [
        {
          startAt: "2026-07-20T01:00:00Z",
          endAt: "2026-07-20T02:00:00Z",
        },
      ],
    });

    await harness.creator.create(actor, plannerInput({ selectedTaskIds: [] }));

    expect(harness.persisted[0]?.proposal.actions[0]).toMatchObject({
      kind: "create",
      after: {
        schedule: {
          startAt: "2026-07-20T02:10:00Z",
          endAt: "2026-07-20T03:10:00Z",
        },
      },
    });
  });

  it("keeps overflow and impossible fixed constraints reviewable as defer actions", async () => {
    const overflow = createHarness({
      extraction: newTaskExtraction(),
      busyItems: [
        {
          startAt: "2026-07-20T01:00:00Z",
          endAt: "2026-07-20T02:00:00Z",
        },
      ],
    });
    await overflow.creator.create(
      actor,
      plannerInput({
        selectedTaskIds: [],
        workWindow: { start: "09:00", end: "10:30" },
        bufferMinutes: 0,
      }),
    );
    expect(overflow.persisted[0]?.proposal.overflow).toEqual([
      { semanticRef: "new-1", reason: "NO_FREE_INTERVAL" },
    ]);
    expect(overflow.persisted[0]?.proposal.actions[0]).toMatchObject({
      kind: "defer",
      semanticRef: "new-1",
      taskId: null,
    });

    const impossible = createHarness({
      extraction: newTaskExtraction({
        kind: "fixed",
        start: { date: "2026-07-20", time: "18:00" },
        end: { date: "2026-07-20", time: "19:00" },
      }),
    });
    await impossible.creator.create(actor, plannerInput({ selectedTaskIds: [] }));
    expect(impossible.persisted[0]?.proposal.conflicts).toEqual([
      { semanticRef: "new-1", code: "FIXED_OUTSIDE_WORK_WINDOW" },
    ]);
    expect(impossible.persisted[0]?.proposal.actions[0]).toMatchObject({ kind: "defer" });
  });

  it("persists an honest empty proposal for irrelevant input", async () => {
    const harness = createHarness({
      extraction: {
        schemaVersion: PLANNER_SCHEMA_VERSION,
        disposition: "irrelevant",
        summary: "No planning actions were found.",
        tasks: [],
        uncertainties: [],
      },
    });

    await harness.creator.create(actor, plannerInput({ selectedTaskIds: [] }));

    expect(harness.persisted[0]?.proposal).toMatchObject({
      subjects: [],
      actions: [],
      overflow: [],
      conflicts: [],
    });
  });

  it("reports a DST-gap work window deterministically without querying a malformed range", async () => {
    const harness = createHarness({ extraction: newTaskExtraction() });

    await harness.creator.create(
      actor,
      plannerInput({
        brainDump: "Plan one task",
        selectedTaskIds: [],
        planningDate: "2026-03-08",
        timeZone: "America/New_York",
        workWindow: { start: "02:15", end: "03:30" },
      }),
    );

    expect(harness.busyCalls).not.toHaveBeenCalled();
    expect(harness.persisted[0]?.proposal).toMatchObject({
      subjects: [],
      actions: [],
      conflicts: [{ semanticRef: null, code: "INVALID_WORK_WINDOW" }],
    });
  });
});

describe("planner proposal failure containment", () => {
  it("returns a recoverable disabled state before reading task content", async () => {
    const harness = createHarness({ provider: null });

    await expect(harness.creator.create(actor, plannerInput())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(harness.selectedCalls).not.toHaveBeenCalled();
    expect(harness.busyCalls).not.toHaveBeenCalled();
    expect(harness.persisted).toHaveLength(0);
  });

  it.each([
    ["timeout", "PROVIDER_UNAVAILABLE"],
    ["unavailable", "PROVIDER_UNAVAILABLE"],
    ["refusal", "VALIDATION_FAILED"],
    ["malformed_output", "VALIDATION_FAILED"],
    ["semantic_invalid", "VALIDATION_FAILED"],
  ] as const)("maps %s provider failures with no proposal write", async (kind, expectedCode) => {
    const harness = createHarness({ providerError: new PlannerProviderError(kind) });

    await expect(harness.creator.create(actor, plannerInput())).rejects.toMatchObject({
      code: expectedCode,
    });
    expect(harness.busyCalls).not.toHaveBeenCalled();
    expect(harness.persisted).toHaveLength(0);
  });

  it("rejects cross-user or missing selected-task snapshots before provider invocation", async () => {
    const selectedTasks: PlannerSelectedTaskReader = {
      async loadOpenUnscheduled() {
        throw new ApplicationError("NOT_FOUND", "A selected task was not found.");
      },
    };
    const harness = createHarness();
    const creator = createPlannerProposalCreator({
      provider: {
        extract: async () => {
          harness.providerCalls();
          return { extraction: selectedExtraction(), model: "gpt-5.6" };
        },
      },
      selectedTasks,
      busyIntervals: {
        readBusyIntervals: async () => ({
          items: [],
          truncation: {
            truncated: false,
            reasons: [],
            recurrenceRowsEvaluated: 0,
            occurrenceEventsEvaluated: 0,
            candidateEvaluations: 0,
          },
        }),
      },
      proposals: {
        persist: async () => {
          throw new Error("must not persist");
        },
      },
    });

    await expect(creator.create(actor, plannerInput())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(harness.providerCalls).not.toHaveBeenCalled();
  });

  it("fails closed when an injected task reader violates its bounded DTO contract", async () => {
    const harness = createHarness({
      snapshots: [{ ...selectedSnapshot, title: " Review launch" } as PlannerSelectedTaskSnapshot],
    });

    await expect(harness.creator.create(actor, plannerInput())).rejects.toMatchObject({
      code: "INTERNAL",
    });
    expect(harness.providerCalls).not.toHaveBeenCalled();
    expect(harness.persisted).toHaveLength(0);
  });

  it("rejects unknown semantic references and schema-incompatible output before busy reads or writes", async () => {
    const unknownReference = createHarness({
      extraction: selectedExtraction({
        tasks: [
          {
            ...selectedExtraction().tasks[0]!,
            source: { kind: "selected_task", semanticRef: "selected-2" },
          },
        ],
      }),
    });
    await expect(unknownReference.creator.create(actor, plannerInput())).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(unknownReference.busyCalls).not.toHaveBeenCalled();
    expect(unknownReference.persisted).toHaveLength(0);

    const malformed = createHarness({
      extraction: { schemaVersion: 1, disposition: "actionable" } as unknown as ModelExtraction,
    });
    await expect(malformed.creator.create(actor, plannerInput())).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(malformed.persisted).toHaveLength(0);
  });

  it.each([
    "source_limit",
    "event_source_limit",
    "series_candidate_limit",
    "request_candidate_limit",
    "output_limit",
  ] as const)("refuses %s occurrence truncation rather than plan against partial context", async (reason) => {
    const harness = createHarness({
      extraction: newTaskExtraction(),
      busyTruncationReason: reason,
    });

    await expect(harness.creator.create(actor, plannerInput({ selectedTaskIds: [] }))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringMatching(/recurring occurrence context was truncated/i),
    });
    expect(harness.schedule).not.toHaveBeenCalled();
    expect(harness.persisted).toHaveLength(0);
  });
});
