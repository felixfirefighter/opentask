import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PlannerAction } from "../../modules/assistant/index.ts";

import {
  BASE_NOW,
  OWNER_A,
  OWNER_B,
  createPlannerApplyTestHarness,
  deterministicId,
  proposalDocument,
  selection,
  timed,
} from "./support/planner-apply-test-harness.ts";

type Harness = Awaited<ReturnType<typeof createPlannerApplyTestHarness>>;

let harness: Harness;

describe("planner apply composed PostgreSQL runtime", () => {
  beforeAll(async () => {
    harness = await createPlannerApplyTestHarness();
  });

  beforeEach(() => {
    harness.clock.set(BASE_NOW);
  });

  afterAll(async () => harness.teardown());

  it("atomically groups same-user edits, creates in Inbox, transitions the proposal, and retries idempotently", async () => {
    const list = await harness.createList(OWNER_A, deterministicId(100), "Apply success");
    const existing = await harness.createTask(OWNER_A, deterministicId(101), list.id, "Review launch");
    const createdTaskId = deterministicId(102);
    const actions: PlannerAction[] = [
      {
        actionId: deterministicId(103),
        kind: "update",
        semanticRef: "selected-1",
        taskId: existing.id,
        before: { title: existing.title, descriptionMd: existing.descriptionMd },
        after: { title: "Review the final launch", descriptionMd: "Confirm demo evidence." },
        rationale: "Clarify the launch review.",
        uncertainties: [],
      },
      {
        actionId: deterministicId(104),
        kind: "prioritize",
        semanticRef: "selected-1",
        taskId: existing.id,
        before: "none",
        after: "high",
        rationale: "The launch is time-sensitive.",
        uncertainties: [],
      },
      {
        actionId: deterministicId(105),
        kind: "schedule",
        semanticRef: "selected-1",
        taskId: existing.id,
        before: null,
        after: timed("2026-07-20T02:00:00Z", "2026-07-20T02:30:00Z"),
        rationale: "Reserve a focused review block.",
        uncertainties: [],
      },
      {
        actionId: createdTaskId,
        kind: "create",
        semanticRef: "new-1",
        after: {
          title: "Draft launch brief",
          descriptionMd: "Summarize the final demo story.",
          priority: "medium",
          schedule: timed("2026-07-20T03:00:00Z", "2026-07-20T04:00:00Z"),
        },
        rationale: "The launch needs a concise brief.",
        uncertainties: [],
      },
    ];
    const proposal = await harness.persistProposal(
      OWNER_A,
      proposalDocument({
        subjects: [
          {
            semanticRef: "selected-1",
            title: existing.title,
            source: "selected_task",
            taskId: existing.id,
          },
          {
            semanticRef: "new-1",
            title: "Draft launch brief",
            source: "brain_dump",
            taskId: null,
          },
        ],
        actions,
      }),
      { [existing.id]: existing.version },
    );

    await expect(harness.assistant.applyProposal(OWNER_A, proposal.id, selection(proposal))).resolves.toEqual(
      { proposalId: proposal.id, outcome: "applied", appliedActionCount: 4 },
    );

    expect(await harness.storedTask(OWNER_A, existing.id)).toMatchObject({
      title: "Review the final launch",
      description_md: "Confirm demo evidence.",
      priority: "high",
      version: 2,
    });
    const existingSchedule = await harness.storedSchedule(OWNER_A, existing.id);
    expect(existingSchedule).toMatchObject({
      kind: "timed",
      timezone: "Asia/Singapore",
    });
    expect((existingSchedule?.start_at as Date).toISOString()).toBe("2026-07-20T02:00:00.000Z");
    expect((existingSchedule?.end_at as Date).toISOString()).toBe("2026-07-20T02:30:00.000Z");
    expect(await harness.storedTask(OWNER_A, createdTaskId)).toMatchObject({
      list_id: await harness.activeInboxId(OWNER_A),
      title: "Draft launch brief",
      priority: "medium",
      version: 1,
    });
    const createdSchedule = await harness.storedSchedule(OWNER_A, createdTaskId);
    expect(createdSchedule).toMatchObject({
      kind: "timed",
      timezone: "Asia/Singapore",
    });
    expect((createdSchedule?.start_at as Date).toISOString()).toBe("2026-07-20T03:00:00.000Z");
    expect((createdSchedule?.end_at as Date).toISOString()).toBe("2026-07-20T04:00:00.000Z");
    expect(await harness.storedProposal(OWNER_A, proposal.id)).toEqual({
      status: "applied",
      applied_at: BASE_NOW,
    });

    await expect(harness.assistant.applyProposal(OWNER_A, proposal.id, selection(proposal))).resolves.toEqual(
      {
        proposalId: proposal.id,
        outcome: "already_applied",
        appliedActionCount: 0,
      },
    );
    expect(await harness.storedTask(OWNER_A, existing.id)).toMatchObject({ version: 2 });
    expect(await harness.storedTask(OWNER_A, createdTaskId)).toMatchObject({ version: 1 });
    await expect(taskCount(harness, OWNER_A.userId, createdTaskId)).resolves.toBe(1);
    expect(await harness.storedProposal(OWNER_A, proposal.id)).toEqual({
      status: "applied",
      applied_at: BASE_NOW,
    });
  });

  it("rejects a stale proposal before any create and leaves its pending transaction state intact", async () => {
    const list = await harness.createList(OWNER_A, deterministicId(200), "Stale apply");
    const existing = await harness.createTask(OWNER_A, deterministicId(201), list.id, "Stale task");
    const proposedCreateId = deterministicId(202);
    const proposal = await harness.persistProposal(
      OWNER_A,
      proposalDocument({
        subjects: [
          selectedSubject(existing.id, existing.title, "selected-1"),
          { semanticRef: "new-1", title: "Must not exist", source: "brain_dump", taskId: null },
        ],
        actions: [
          priorityAction(deterministicId(203), existing.id, "selected-1", "none", "high"),
          {
            actionId: proposedCreateId,
            kind: "create",
            semanticRef: "new-1",
            after: {
              title: "Must not exist",
              descriptionMd: "",
              priority: "none",
              schedule: null,
            },
            rationale: "Create only if the proposal is current.",
            uncertainties: [],
          },
        ],
      }),
      { [existing.id]: existing.version },
    );
    await harness.tasks.tasks.updateTask(OWNER_A, existing.id, {
      expectedVersion: existing.version,
      patch: { descriptionMd: "Changed after proposal creation." },
    });

    await expect(
      harness.assistant.applyProposal(OWNER_A, proposal.id, selection(proposal)),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });

    expect(await harness.storedTask(OWNER_A, existing.id)).toMatchObject({
      description_md: "Changed after proposal creation.",
      priority: "none",
      version: 2,
    });
    await expect(taskCount(harness, OWNER_A.userId, proposedCreateId)).resolves.toBe(0);
    expect(await harness.storedProposal(OWNER_A, proposal.id)).toEqual({
      status: "pending",
      applied_at: null,
    });
  });

  it("returns existence-safe failures for a foreign task and a foreign proposal", async () => {
    const foreignList = await harness.createList(OWNER_B, deterministicId(300), "Foreign list");
    const foreignTask = await harness.createTask(
      OWNER_B,
      deterministicId(301),
      foreignList.id,
      "Foreign task",
    );
    const proposal = await harness.persistProposal(
      OWNER_A,
      proposalDocument({
        subjects: [selectedSubject(foreignTask.id, foreignTask.title, "selected-1")],
        actions: [priorityAction(deterministicId(302), foreignTask.id, "selected-1", "none", "high")],
      }),
      { [foreignTask.id]: foreignTask.version },
    );

    await expect(
      harness.assistant.applyProposal(OWNER_A, proposal.id, selection(proposal)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      harness.assistant.applyProposal(OWNER_B, proposal.id, selection(proposal)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await harness.storedTask(OWNER_B, foreignTask.id)).toMatchObject({
      priority: "none",
      version: 1,
    });
    expect(await harness.storedProposal(OWNER_A, proposal.id)).toMatchObject({ status: "pending" });
  });

  it("persists expiry and rejects rejected proposals without task writes", async () => {
    const list = await harness.createList(OWNER_A, deterministicId(400), "Terminal proposals");
    const expires = await harness.createTask(OWNER_A, deterministicId(401), list.id, "Expires");
    const expiredProposal = await persistPriorityProposal(harness, expires, deterministicId(402));
    harness.clock.set("2026-07-19T01:31:00.000Z");

    await expect(
      harness.assistant.applyProposal(OWNER_A, expiredProposal.id, selection(expiredProposal)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await harness.storedProposal(OWNER_A, expiredProposal.id)).toEqual({
      status: "expired",
      applied_at: null,
    });
    expect(await harness.storedTask(OWNER_A, expires.id)).toMatchObject({ priority: "none", version: 1 });

    harness.clock.set(BASE_NOW);
    const rejects = await harness.createTask(OWNER_A, deterministicId(403), list.id, "Rejected");
    const rejectedProposal = await persistPriorityProposal(harness, rejects, deterministicId(404));
    await harness.proposals.reject(OWNER_A, rejectedProposal.id);

    await expect(
      harness.assistant.applyProposal(OWNER_A, rejectedProposal.id, selection(rejectedProposal)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await harness.storedProposal(OWNER_A, rejectedProposal.id)).toEqual({
      status: "rejected",
      applied_at: null,
    });
    expect(await harness.storedTask(OWNER_A, rejects.id)).toMatchObject({ priority: "none", version: 1 });
  });

  it("rejects overlapping and out-of-window schedules without changing tasks or proposal state", async () => {
    const list = await harness.createList(OWNER_A, deterministicId(500), "Schedule rejection");
    const busy = await harness.createTask(OWNER_A, deterministicId(501), list.id, "Busy block");
    await harness.tasks.schedules.setSchedule(OWNER_A, busy.id, {
      expectedVersion: busy.version,
      schedule: {
        kind: "timed",
        startAt: "2026-07-20T02:15:00Z",
        endAt: "2026-07-20T02:45:00Z",
        timezone: "Asia/Singapore",
      },
    });
    const overlapping = await harness.createTask(OWNER_A, deterministicId(502), list.id, "Overlapping");
    const overlapProposal = await persistScheduleProposal(
      harness,
      overlapping,
      deterministicId(503),
      timed("2026-07-20T02:00:00Z", "2026-07-20T02:30:00Z"),
    );

    await expect(
      harness.assistant.applyProposal(OWNER_A, overlapProposal.id, selection(overlapProposal)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await harness.storedSchedule(OWNER_A, overlapping.id)).toBeUndefined();
    expect(await harness.storedProposal(OWNER_A, overlapProposal.id)).toMatchObject({
      status: "pending",
    });

    const outside = await harness.createTask(OWNER_A, deterministicId(504), list.id, "Outside window");
    const outsideProposal = await persistScheduleProposal(
      harness,
      outside,
      deterministicId(505),
      timed("2026-07-20T00:30:00Z", "2026-07-20T01:30:00Z"),
    );
    await expect(
      harness.assistant.applyProposal(OWNER_A, outsideProposal.id, selection(outsideProposal)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await harness.storedSchedule(OWNER_A, outside.id)).toBeUndefined();
    expect(await harness.storedProposal(OWNER_A, outsideProposal.id)).toMatchObject({
      status: "pending",
    });
  });

  it("rolls back earlier task writes and the proposal transition on a forced mid-batch failure", async () => {
    const list = await harness.createList(OWNER_A, deterministicId(600), "Atomic rollback");
    const first = await harness.createTask(OWNER_A, deterministicId(601), list.id, "First unchanged");
    const overflow = await harness.createTask(OWNER_A, deterministicId(602), list.id, "Overflow unchanged");
    await harness.pool.query(`update tasks set version = 2147483647 where user_id = $1 and id = $2`, [
      OWNER_A.userId,
      overflow.id,
    ]);
    const proposal = await harness.persistProposal(
      OWNER_A,
      proposalDocument({
        subjects: [
          selectedSubject(first.id, first.title, "selected-1"),
          selectedSubject(overflow.id, overflow.title, "selected-2"),
        ],
        actions: [
          priorityAction(deterministicId(603), first.id, "selected-1", "none", "high"),
          priorityAction(deterministicId(604), overflow.id, "selected-2", "none", "high"),
        ],
      }),
      { [first.id]: first.version, [overflow.id]: 2_147_483_647 },
    );

    await expect(
      harness.assistant.applyProposal(OWNER_A, proposal.id, selection(proposal)),
    ).rejects.toBeDefined();

    expect(await harness.storedTask(OWNER_A, first.id)).toMatchObject({ priority: "none", version: 1 });
    expect(await harness.storedTask(OWNER_A, overflow.id)).toMatchObject({
      priority: "none",
      version: 2_147_483_647,
    });
    expect(await harness.storedProposal(OWNER_A, proposal.id)).toEqual({
      status: "pending",
      applied_at: null,
    });
  });
});

function selectedSubject(taskId: string, title: string, semanticRef: "selected-1" | "selected-2") {
  return { semanticRef, title, source: "selected_task" as const, taskId };
}

function priorityAction(
  actionId: string,
  taskId: string,
  semanticRef: "selected-1" | "selected-2",
  before: "none" | "low" | "medium" | "high",
  after: "none" | "low" | "medium" | "high",
): PlannerAction {
  return {
    actionId,
    kind: "prioritize",
    semanticRef,
    taskId,
    before,
    after,
    rationale: "Apply the reviewed priority.",
    uncertainties: [],
  };
}

async function persistPriorityProposal(
  target: Harness,
  task: Readonly<{ id: string; title: string; version: number }>,
  actionId: string,
) {
  return target.persistProposal(
    OWNER_A,
    proposalDocument({
      subjects: [selectedSubject(task.id, task.title, "selected-1")],
      actions: [priorityAction(actionId, task.id, "selected-1", "none", "high")],
    }),
    { [task.id]: task.version },
  );
}

async function persistScheduleProposal(
  target: Harness,
  task: Readonly<{ id: string; title: string; version: number }>,
  actionId: string,
  schedule: ReturnType<typeof timed>,
) {
  return target.persistProposal(
    OWNER_A,
    proposalDocument({
      subjects: [selectedSubject(task.id, task.title, "selected-1")],
      actions: [
        {
          actionId,
          kind: "schedule",
          semanticRef: "selected-1",
          taskId: task.id,
          before: null,
          after: schedule,
          rationale: "Reserve the reviewed work block.",
          uncertainties: [],
        },
      ],
    }),
    { [task.id]: task.version },
  );
}

async function taskCount(target: Harness, userId: string, taskId: string): Promise<number> {
  const result = await target.pool.query(
    `select count(*)::int as count from tasks where user_id = $1 and id = $2`,
    [userId, taskId],
  );
  return result.rows[0]?.count as number;
}
