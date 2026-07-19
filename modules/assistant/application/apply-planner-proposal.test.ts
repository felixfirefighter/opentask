import { describe, expect, it } from "vitest";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";

import {
  PLANNER_SCHEMA_VERSION,
  plannerProposalDtoSchema,
  type PlannerAction,
  type PlannerApplyDependencies,
  type PlannerApplyTaskSnapshot,
  type PlannerProposalDto,
  type PlannerSchedule,
  type PlannerSelection,
} from "./contracts";
import { createPlannerProposalApplier } from "./apply-planner-proposal";

const actor: AuthenticatedActor = { userId: "11111111-1111-4111-8111-111111111111" };
const proposalId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const updateActionId = "44444444-4444-4444-8444-444444444444";
const priorityActionId = "55555555-5555-4555-8555-555555555555";
const scheduleActionId = "66666666-6666-4666-8666-666666666666";
const createActionId = "77777777-7777-4777-8777-777777777777";
const deferActionId = "88888888-8888-4888-8888-888888888888";
const applyToken = "99999999-9999-4999-8999-999999999999";
const otherActionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-07-19T10:00:00.000Z");
const transaction = { kind: "test-transaction" } as unknown as DatabaseTransaction;

const currentTask: PlannerApplyTaskSnapshot = {
  id: taskId,
  title: "Review launch",
  descriptionMd: "Current notes",
  priority: "none",
  version: 7,
  schedule: null,
};

function existingTaskProposal(
  overrides: Partial<Pick<PlannerProposalDto, "status" | "expiresAt" | "appliedAt">> = {},
): PlannerProposalDto {
  return plannerProposalDtoSchema.parse({
    id: proposalId,
    planningDate: "2026-07-20",
    schemaVersion: PLANNER_SCHEMA_VERSION,
    proposal: {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      planningDate: "2026-07-20",
      planningContext: {
        timeZone: "Asia/Singapore",
        workWindow: { start: "09:00", end: "17:00" },
        defaultDurationMinutes: 30,
        bufferMinutes: 10,
      },
      summary: "Clarify and schedule launch work.",
      subjects: [
        {
          semanticRef: "selected-1",
          title: currentTask.title,
          source: "selected_task",
          taskId,
        },
      ],
      actions: [
        {
          actionId: updateActionId,
          kind: "update",
          semanticRef: "selected-1",
          taskId,
          before: { title: currentTask.title, descriptionMd: currentTask.descriptionMd },
          after: { title: "Review launch plan", descriptionMd: currentTask.descriptionMd },
          rationale: "Clarify the task.",
          uncertainties: [],
        },
        {
          actionId: priorityActionId,
          kind: "prioritize",
          semanticRef: "selected-1",
          taskId,
          before: "none",
          after: "high",
          rationale: "The launch is time-sensitive.",
          uncertainties: [],
        },
        {
          actionId: scheduleActionId,
          kind: "schedule",
          semanticRef: "selected-1",
          taskId,
          before: null,
          after: timed("2026-07-20T02:00:00Z", "2026-07-20T02:30:00Z"),
          rationale: "Reserve a focused block.",
          uncertainties: [],
        },
      ],
      overflow: [],
      conflicts: [],
      uncertainties: [],
    },
    contextVersions: { [taskId]: 7 },
    status: "pending",
    model: "gpt-5.6",
    promptVersion: "planner-v1",
    applyToken,
    createdAt: "2026-07-19T09:00:00.000Z",
    expiresAt: "2026-07-19T11:00:00.000Z",
    appliedAt: null,
    ...overrides,
  });
}

function createTaskProposal(): PlannerProposalDto {
  return plannerProposalDtoSchema.parse({
    ...existingTaskProposal(),
    proposal: {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      planningDate: "2026-07-20",
      planningContext: existingTaskProposal().proposal.planningContext,
      summary: "Create the launch brief.",
      subjects: [
        {
          semanticRef: "new-1",
          title: "Draft launch brief",
          source: "brain_dump",
          taskId: null,
        },
      ],
      actions: [
        {
          actionId: createActionId,
          kind: "create",
          semanticRef: "new-1",
          after: {
            title: "Draft launch brief",
            descriptionMd: "",
            priority: "medium",
            schedule: timed("2026-07-20T03:00:00Z", "2026-07-20T04:00:00Z"),
          },
          rationale: "A concrete brief is needed.",
          uncertainties: [],
        },
      ],
      overflow: [],
      conflicts: [],
      uncertainties: [],
    },
    contextVersions: {},
  });
}

function deferProposal(): PlannerProposalDto {
  return plannerProposalDtoSchema.parse({
    ...existingTaskProposal(),
    proposal: {
      ...existingTaskProposal().proposal,
      summary: "Defer work that cannot fit safely.",
      actions: [
        {
          actionId: deferActionId,
          kind: "defer",
          semanticRef: "selected-1",
          taskId,
          rationale: "No safe interval remains.",
          uncertainties: ["The task duration may change."],
        },
      ],
    },
  });
}

function timed(startAt: string, endAt: string, timeZone = "Asia/Singapore"): PlannerSchedule {
  return { kind: "timed", startAt, endAt, timeZone };
}

function selection(
  proposal: PlannerProposalDto,
  actions: readonly PlannerAction[] = proposal.proposal.actions,
): PlannerSelection {
  return { proposalId: proposal.id, applyToken: proposal.applyToken, actions: [...actions] };
}

type HarnessOptions = Readonly<{
  proposal?: PlannerProposalDto | null;
  snapshots?: readonly PlannerApplyTaskSnapshot[];
  busyItems?: readonly Readonly<{ schedule: PlannerSchedule }>[];
  busyTruncated?: boolean;
  writerError?: Error;
  markApplied?: boolean;
  markExpired?: boolean;
}>;

function createHarness(options: HarnessOptions = {}) {
  const stored = options.proposal === undefined ? existingTaskProposal() : options.proposal;
  const events: string[] = [];
  const calls = {
    loadedTaskIds: [] as string[][],
    busy: [] as Array<{
      query: unknown;
      excludedTaskIds: readonly string[];
      transaction: DatabaseTransaction;
    }>,
    writes: [] as Array<{
      actions: readonly PlannerAction[];
      versions: Readonly<Record<string, number>>;
      transaction: DatabaseTransaction;
    }>,
    markedApplied: 0,
    markedExpired: 0,
  };
  const dependencies: PlannerApplyDependencies = {
    transaction: {
      async execute(work) {
        events.push("transaction:start");
        try {
          const result = await work(transaction);
          events.push("transaction:commit");
          return result;
        } catch (error) {
          events.push("transaction:rollback");
          throw error;
        }
      },
    },
    proposals: {
      async loadOwnedForUpdate(_actor, _proposalId, passedTransaction) {
        expect(passedTransaction).toBe(transaction);
        events.push("proposal:lock");
        return stored;
      },
      async markExpired(_actor, _proposalId, passedTransaction) {
        expect(passedTransaction).toBe(transaction);
        calls.markedExpired += 1;
        events.push("proposal:expired");
        return options.markExpired ?? true;
      },
      async markApplied(_actor, _proposalId, token, appliedAt, passedTransaction) {
        expect(passedTransaction).toBe(transaction);
        expect(token).toBe(applyToken);
        expect(appliedAt).toEqual(now);
        calls.markedApplied += 1;
        events.push("proposal:applied");
        return options.markApplied ?? true;
      },
    },
    tasks: {
      async loadOwnedOpenForUpdate(_actor, taskIds, passedTransaction) {
        expect(passedTransaction).toBe(transaction);
        calls.loadedTaskIds.push([...taskIds]);
        events.push("tasks:lock");
        return options.snapshots ?? [currentTask];
      },
      async loadBusySchedulesForUpdate(_actor, query, excludedTaskIds, passedTransaction) {
        calls.busy.push({ query, excludedTaskIds, transaction: passedTransaction });
        events.push("schedules:lock");
        return { items: options.busyItems ?? [], truncated: options.busyTruncated ?? false };
      },
      async applyAllowedActions(_actor, actions, versions, passedTransaction) {
        calls.writes.push({ actions, versions, transaction: passedTransaction });
        events.push("tasks:write");
        if (options.writerError) throw options.writerError;
      },
    },
  };
  const applier = createPlannerProposalApplier(dependencies, { clock: { now: () => now } });
  return { applier, calls, events, proposal: stored ?? existingTaskProposal() };
}

describe("planner proposal apply selection", () => {
  it("applies only selected editable after-values through one shared transaction", async () => {
    const harness = createHarness();
    const [update, , scheduled] = harness.proposal.proposal.actions;
    if (update?.kind !== "update" || scheduled?.kind !== "schedule") throw new Error("Invalid fixture.");
    const reviewedActions: PlannerAction[] = [
      {
        ...update,
        after: { title: "Review the final launch plan", descriptionMd: "Keep the approved notes." },
      },
      {
        ...scheduled,
        after: timed("2026-07-20T04:00:00Z", "2026-07-20T04:45:00Z"),
      },
    ];

    const result = await harness.applier.apply(
      actor,
      proposalId,
      selection(harness.proposal, reviewedActions),
    );

    expect(result).toEqual({ proposalId, outcome: "applied", appliedActionCount: 2 });
    expect(harness.calls.loadedTaskIds).toEqual([[taskId]]);
    expect(harness.calls.busy).toEqual([
      {
        query: {
          rangeStartDate: "2026-07-20",
          rangeEndDate: "2026-07-21",
          rangeStartAt: "2026-07-20T01:00:00Z",
          rangeEndAt: "2026-07-20T09:00:00Z",
          limit: 500,
        },
        excludedTaskIds: [taskId],
        transaction,
      },
    ]);
    expect(harness.calls.writes).toEqual([
      { actions: reviewedActions, versions: { [taskId]: 7 }, transaction },
    ]);
    expect(harness.events).toEqual([
      "transaction:start",
      "proposal:lock",
      "tasks:lock",
      "schedules:lock",
      "tasks:write",
      "proposal:applied",
      "transaction:commit",
    ]);
  });

  it("allows create after-values to be edited while preserving the trusted action identity", async () => {
    const proposal = createTaskProposal();
    const harness = createHarness({ proposal, snapshots: [] });
    const original = proposal.proposal.actions[0];
    if (original?.kind !== "create") throw new Error("Invalid fixture.");
    const reviewed: PlannerAction = {
      ...original,
      after: {
        title: "Draft the concise launch brief",
        descriptionMd: "Cover the final demo story.",
        priority: "high",
        schedule: null,
      },
    };

    const result = await harness.applier.apply(actor, proposal.id, selection(proposal, [reviewed]));

    expect(result.appliedActionCount).toBe(1);
    expect(harness.calls.loadedTaskIds).toEqual([[]]);
    expect(harness.calls.busy).toEqual([]);
    expect(harness.calls.writes[0]).toEqual({ actions: [reviewed], versions: {}, transaction });
  });

  it("treats defer as a validated no-op and still closes the proposal", async () => {
    const proposal = deferProposal();
    const harness = createHarness({ proposal });

    const result = await harness.applier.apply(actor, proposal.id, selection(proposal));

    expect(result).toEqual({ proposalId, outcome: "applied", appliedActionCount: 0 });
    expect(harness.calls.loadedTaskIds).toEqual([[taskId]]);
    expect(harness.calls.writes).toEqual([]);
    expect(harness.calls.markedApplied).toBe(1);
  });

  it("rejects an action that was not part of the persisted proposal", async () => {
    const harness = createHarness();
    const original = harness.proposal.proposal.actions[0];
    if (!original) throw new Error("Invalid fixture.");

    await expect(
      harness.applier.apply(
        actor,
        proposalId,
        selection(harness.proposal, [{ ...original, actionId: otherActionId }]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(harness.calls.loadedTaskIds).toEqual([]);
    expect(harness.calls.writes).toEqual([]);
    expect(harness.events.at(-1)).toBe("transaction:rollback");
  });

  it("rejects edits to immutable targets, before-values, rationale, or action kinds", async () => {
    const proposal = existingTaskProposal();
    const original = proposal.proposal.actions[0];
    if (original?.kind !== "update") throw new Error("Invalid fixture.");
    const changedBefore: PlannerAction = {
      ...original,
      before: { ...original.before, title: "Untrusted before title" },
    };
    const changedRationale: PlannerAction = { ...original, rationale: "A replaced rationale." };
    const changedKind: PlannerAction = {
      actionId: original.actionId,
      kind: "defer",
      semanticRef: original.semanticRef,
      taskId: original.taskId,
      rationale: original.rationale,
      uncertainties: original.uncertainties,
    };

    for (const action of [changedBefore, changedRationale, changedKind]) {
      const harness = createHarness({ proposal });
      await expect(
        harness.applier.apply(actor, proposalId, selection(proposal, [action])),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
      expect(harness.calls.writes).toEqual([]);
    }
  });
});

describe("planner proposal apply lifecycle and stale safety", () => {
  it("returns an idempotent no-write result after an earlier apply", async () => {
    const proposal = existingTaskProposal({
      status: "applied",
      appliedAt: "2026-07-19T09:30:00.000Z",
    });
    const harness = createHarness({ proposal });

    await expect(harness.applier.apply(actor, proposalId, selection(proposal))).resolves.toEqual({
      proposalId,
      outcome: "already_applied",
      appliedActionCount: 0,
    });
    expect(harness.calls.loadedTaskIds).toEqual([]);
    expect(harness.calls.writes).toEqual([]);
    expect(harness.calls.markedApplied).toBe(0);
  });

  it("persists expiry without allowing any task write", async () => {
    const proposal = existingTaskProposal({ expiresAt: "2026-07-19T10:00:00.000Z" });
    const harness = createHarness({ proposal });

    await expect(harness.applier.apply(actor, proposalId, selection(proposal))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(harness.calls.markedExpired).toBe(1);
    expect(harness.calls.writes).toEqual([]);
    expect(harness.events.at(-1)).toBe("transaction:commit");
  });

  it("rejects an already rejected proposal without loading task state", async () => {
    const proposal = existingTaskProposal({ status: "rejected" });
    const harness = createHarness({ proposal });

    await expect(harness.applier.apply(actor, proposalId, selection(proposal))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(harness.calls.loadedTaskIds).toEqual([]);
    expect(harness.calls.writes).toEqual([]);
  });

  it("rejects a selection for another proposal before opening a transaction", async () => {
    const proposal = existingTaskProposal();
    const harness = createHarness({ proposal });

    await expect(
      harness.applier.apply(actor, proposalId, {
        ...selection(proposal),
        proposalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(harness.events).toEqual([]);
  });

  it("rejects missing proposals and mismatched apply tokens without task access", async () => {
    const missing = createHarness({ proposal: null });
    await expect(
      missing.applier.apply(actor, proposalId, selection(existingTaskProposal())),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const proposal = existingTaskProposal();
    const wrongToken = createHarness({ proposal });
    await expect(
      wrongToken.applier.apply(actor, proposalId, {
        ...selection(proposal),
        applyToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(wrongToken.calls.loadedTaskIds).toEqual([]);
  });

  it("rejects missing, cross-owner, or no-longer-open task snapshots existence-safely", async () => {
    const harness = createHarness({ snapshots: [] });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
    expect(harness.calls.writes).toEqual([]);
  });

  it("rejects a stale task version and reports only the safe current version", async () => {
    const harness = createHarness({ snapshots: [{ ...currentTask, version: 8 }] });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toMatchObject(
      {
        code: "CONFLICT",
        currentVersion: 8,
      },
    );
    expect(harness.calls.busy).toEqual([]);
    expect(harness.calls.writes).toEqual([]);
  });

  it("defensively rejects changed before-values even if an adapter returns the old version", async () => {
    const harness = createHarness({ snapshots: [{ ...currentTask, title: "Changed without a version" }] });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toMatchObject(
      {
        code: "CONFLICT",
        currentVersion: 7,
      },
    );
    expect(harness.calls.writes).toEqual([]);
  });
});

describe("planner proposal apply deterministic schedule validation", () => {
  it("rejects overlap with a newly busy interval under the saved buffer", async () => {
    const harness = createHarness({
      busyItems: [{ schedule: timed("2026-07-20T02:20:00Z", "2026-07-20T03:00:00Z") }],
    });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toMatchObject(
      {
        code: "CONFLICT",
      },
    );
    expect(harness.calls.writes).toEqual([]);
    expect(harness.calls.markedApplied).toBe(0);
  });

  it("rejects edited blocks outside the work window or in a different timezone", async () => {
    const proposal = existingTaskProposal();
    const scheduleAction = proposal.proposal.actions.find(
      (action): action is Extract<PlannerAction, { kind: "schedule" }> => action.kind === "schedule",
    );
    if (!scheduleAction) throw new Error("Invalid fixture.");
    const invalidActions: PlannerAction[] = [
      { ...scheduleAction, after: timed("2026-07-20T00:30:00Z", "2026-07-20T01:30:00Z") },
      {
        ...scheduleAction,
        after: timed("2026-07-20T02:00:00Z", "2026-07-20T02:30:00Z", "America/New_York"),
      },
    ];

    for (const action of invalidActions) {
      const harness = createHarness({ proposal });
      await expect(
        harness.applier.apply(actor, proposalId, selection(proposal, [action])),
      ).rejects.toBeInstanceOf(ApplicationError);
      expect(harness.calls.writes).toEqual([]);
    }
  });

  it("rejects all-day review edits because planner blocks must fit the work window", async () => {
    const proposal = createTaskProposal();
    const original = proposal.proposal.actions[0];
    if (original?.kind !== "create") throw new Error("Invalid fixture.");
    const allDay: PlannerAction = {
      ...original,
      after: {
        ...original.after,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      },
    };
    const harness = createHarness({ proposal, snapshots: [] });

    await expect(
      harness.applier.apply(actor, proposalId, selection(proposal, [allDay])),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(harness.calls.busy).toEqual([]);
    expect(harness.calls.writes).toEqual([]);
  });

  it("rejects a truncated busy read instead of validating incomplete calendar state", async () => {
    const harness = createHarness({ busyTruncated: true });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toMatchObject(
      {
        code: "VALIDATION_FAILED",
      },
    );
    expect(harness.calls.writes).toEqual([]);
  });

  it("rejects malformed busy state returned by an adapter", async () => {
    const harness = createHarness({
      busyItems: [
        {
          schedule: {
            kind: "timed",
            startAt: "not-an-instant",
            endAt: "2026-07-20T03:00:00Z",
            timeZone: "Asia/Singapore",
          } as PlannerSchedule,
        },
      ],
    });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toMatchObject(
      {
        code: "INTERNAL",
      },
    );
    expect(harness.calls.writes).toEqual([]);
  });
});

describe("planner proposal apply atomic failure behavior", () => {
  it("rolls back and leaves the proposal pending when the task writer fails", async () => {
    const harness = createHarness({ writerError: new Error("forced task write failure") });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toThrow(
      "forced task write failure",
    );
    expect(harness.calls.markedApplied).toBe(0);
    expect(harness.events.at(-1)).toBe("transaction:rollback");
  });

  it("rolls back task writes when the final conditional proposal transition loses", async () => {
    const harness = createHarness({ markApplied: false });

    await expect(harness.applier.apply(actor, proposalId, selection(harness.proposal))).rejects.toMatchObject(
      {
        code: "CONFLICT",
      },
    );
    expect(harness.calls.writes).toHaveLength(1);
    expect(harness.events.at(-1)).toBe("transaction:rollback");
  });
});
