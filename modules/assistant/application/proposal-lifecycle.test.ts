import { describe, expect, it } from "vitest";

import type { AuthenticatedActor } from "@/shared/auth/actor";

import type { createPlannerProposalRepository } from "../infrastructure/planner-proposal-repository";
import { PLANNER_PROMPT_VERSION, PLANNER_SCHEMA_VERSION } from "./contracts/contract-primitives";
import type {
  NewPlannerProposalRecord,
  PlannerProposalPersistence,
  StoredPlannerProposalRecord,
} from "./contracts/proposal-persistence-contract";
import type { PlannerProposal } from "./contracts/proposal-contract";
import { resolvePlannerCapability } from "./planner-capability";
import { createPlannerProposalLifecycle } from "./proposal-lifecycle";

const user: AuthenticatedActor = { userId: "11111111-1111-4111-8111-111111111111" };
const otherUser: AuthenticatedActor = { userId: "22222222-2222-4222-8222-222222222222" };
const taskId = "33333333-3333-4333-8333-333333333333";
const proposalId = "44444444-4444-4444-8444-444444444444";
const applyToken = "55555555-5555-4555-8555-555555555555";
const actionId = "66666666-6666-4666-8666-666666666666";
const persistenceAdapterConforms: ReturnType<
  typeof createPlannerProposalRepository
> extends PlannerProposalPersistence
  ? true
  : false = true;

function proposal(): PlannerProposal {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    planningDate: "2026-07-20",
    planningContext: {
      timeZone: "Asia/Singapore",
      workWindow: { start: "09:00", end: "17:00" },
      defaultDurationMinutes: 30,
      bufferMinutes: 10,
    },
    summary: "Schedule the selected launch review.",
    subjects: [
      {
        semanticRef: "selected-1",
        title: "Review launch",
        source: "selected_task",
        taskId,
      },
    ],
    actions: [
      {
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
        rationale: "It fits the work window.",
        uncertainties: [],
      },
    ],
    overflow: [],
    conflicts: [],
    uncertainties: [],
  };
}

function createMemoryPersistence() {
  const records = new Map<string, StoredPlannerProposalRecord>();
  const key = (userId: string, id: string) => `${userId}:${id}`;

  const persistence: PlannerProposalPersistence = {
    async insert(record: NewPlannerProposalRecord) {
      const stored: StoredPlannerProposalRecord = { ...record };
      records.set(key(record.userId, record.id), stored);
      return stored;
    },
    async findOwned(userId, id) {
      return records.get(key(userId, id)) ?? null;
    },
    async transitionOwned(userId, id, expectedStatus, nextStatus, appliedAt) {
      const current = records.get(key(userId, id));
      if (!current || current.status !== expectedStatus) return null;
      const updated = { ...current, status: nextStatus, appliedAt };
      records.set(key(userId, id), updated);
      return updated;
    },
    async expireOwned(userId, now) {
      let count = 0;
      for (const [recordKey, record] of records) {
        if (record.userId !== userId || record.status !== "pending" || record.expiresAt > now) continue;
        records.set(recordKey, { ...record, status: "expired", appliedAt: null });
        count += 1;
      }
      return count;
    },
  };
  return { persistence, records };
}

function createLifecycle(now = new Date("2026-07-20T00:00:00.000Z")) {
  const memory = createMemoryPersistence();
  let currentTime = now;
  const ids = [proposalId, applyToken];
  const lifecycle = createPlannerProposalLifecycle({
    persistence: memory.persistence,
    clock: { now: () => new Date(currentTime) },
    createId: () => ids.shift() ?? "77777777-7777-4777-8777-777777777777",
    proposalTtlMs: 60_000,
  });
  return {
    ...memory,
    lifecycle,
    setNow(value: Date) {
      currentTime = value;
    },
  };
}

async function persist(lifecycle: ReturnType<typeof createLifecycle>["lifecycle"]) {
  return lifecycle.persist(user, {
    proposal: proposal(),
    contextVersions: { [taskId]: 3 },
    model: "gpt-5.6-2026-07-01",
    promptVersion: PLANNER_PROMPT_VERSION,
  });
}

describe("planner capability", () => {
  it("reports a keyless disabled state without exposing provider configuration", () => {
    expect(resolvePlannerCapability(false)).toEqual({
      state: "disabled",
      reason: "missing_api_key",
    });
    const available = resolvePlannerCapability(true);
    expect(available).toEqual({ state: "available", model: "gpt-5.6", schemaVersion: 1 });
    expect(JSON.stringify(available)).not.toContain("apiKey");
  });
});

describe("proposal lifecycle", () => {
  it("keeps the concrete repository structurally bound to its application port", () => {
    expect(persistenceAdapterConforms).toBe(true);
  });

  it("persists only a validated review document and keeps its apply token opaque", async () => {
    const { lifecycle, records } = createLifecycle();
    const dto = await persist(lifecycle);

    expect(dto).toMatchObject({ id: proposalId, applyToken, status: "pending" });
    expect(records).toHaveLength(1);
    const stored = [...records.values()][0];
    expect(stored?.userId).toBe(user.userId);
    expect(stored?.idempotencyKey).toBe(applyToken);
    expect(stored?.proposal).toMatchObject({
      subjects: [
        {
          semanticRef: "selected-1",
          title: "Review launch",
          source: "selected_task",
          taskId,
        },
      ],
    });
    expect(JSON.stringify(stored)).not.toContain("Prepare launch notes from the private brain dump");
  });

  it("returns existence-safe not found for another actor and rejects only owned pending rows", async () => {
    const { lifecycle } = createLifecycle();
    await persist(lifecycle);

    await expect(lifecycle.get(otherUser, proposalId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(lifecycle.reject(otherUser, proposalId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(lifecycle.reject(user, proposalId)).resolves.toMatchObject({ status: "rejected" });
    await expect(lifecycle.reject(user, proposalId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("fails existence-safe if persistence returns a differently owned row", async () => {
    const fixture = createLifecycle();
    await persist(fixture.lifecycle);
    const storedKey = `${user.userId}:${proposalId}`;
    const stored = fixture.records.get(storedKey);
    expect(stored).toBeDefined();
    fixture.records.set(storedKey, { ...stored!, userId: otherUser.userId });

    await expect(fixture.lifecycle.get(user, proposalId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("expires a pending proposal on read and prevents a later reject", async () => {
    const fixture = createLifecycle();
    await persist(fixture.lifecycle);
    fixture.setNow(new Date("2026-07-20T00:01:00.000Z"));

    await expect(fixture.lifecycle.get(user, proposalId)).resolves.toMatchObject({
      status: "expired",
    });
    await expect(fixture.lifecycle.reject(user, proposalId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects missing context versions before persistence", async () => {
    const { lifecycle, records } = createLifecycle();
    await expect(
      lifecycle.persist(user, {
        proposal: proposal(),
        contextVersions: {},
        model: "gpt-5.6",
        promptVersion: PLANNER_PROMPT_VERSION,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(records).toHaveLength(0);
  });

  it("requires context versions for selected subjects referenced only by overflow", async () => {
    const { lifecycle, records } = createLifecycle();
    const overflowOnlyProposal: PlannerProposal = {
      ...proposal(),
      actions: [],
      overflow: [{ semanticRef: "selected-1", reason: "NO_FREE_INTERVAL" }],
    };

    await expect(
      lifecycle.persist(user, {
        proposal: overflowOnlyProposal,
        contextVersions: {},
        model: "gpt-5.6",
        promptVersion: PLANNER_PROMPT_VERSION,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(records).toHaveLength(0);
  });

  it("fails closed when a persisted versioned document is corrupted", async () => {
    const fixture = createLifecycle();
    await persist(fixture.lifecycle);
    const storedKey = `${user.userId}:${proposalId}`;
    const stored = fixture.records.get(storedKey);
    expect(stored).toBeDefined();
    fixture.records.set(storedKey, { ...stored!, proposal: { schemaVersion: 999 } });

    await expect(fixture.lifecycle.get(user, proposalId)).rejects.toEqual(
      expect.objectContaining({ code: "INTERNAL" }),
    );
  });

  it("scopes bulk expiry to the actor", async () => {
    const fixture = createLifecycle();
    await persist(fixture.lifecycle);
    fixture.setNow(new Date("2026-07-20T00:01:00.000Z"));

    await expect(fixture.lifecycle.expireOwned(otherUser)).resolves.toBe(0);
    await expect(fixture.lifecycle.expireOwned(user)).resolves.toBe(1);
  });
});
