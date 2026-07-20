import { describe, expect, it } from "vitest";

import {
  boundedTaskProjectionSchema,
  canApplyOccurrenceResultOptimistically,
  occurrenceCommandFailureSchema,
  occurrenceCommandRequestSchema,
  occurrenceCommandResultSchema,
  occurrenceKeySchema,
  occurrenceTruncationSchema,
  taskOccurrenceRangeQuerySchema,
} from "./occurrence-contract";

const taskId = "11111111-1111-4111-8111-111111111111";
const otherTaskId = "22222222-2222-4222-8222-222222222222";
const occurrenceKey = "o1.MTExMTExMTExMTExMTExMTExMTExMTExMTExMTEx";
const timestamp = "2026-07-20T00:00:00Z";

function task(version = 4) {
  return {
    id: taskId,
    version,
    listId: "33333333-3333-4333-8333-333333333333",
    sectionId: null,
    parentTaskId: null,
    title: "Review the launch",
    descriptionMd: "",
    status: "open",
    priority: "high",
    rank: "a0",
    statusChangedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  } as const;
}

describe("occurrence contracts", () => {
  it("treats the occurrence identity as one opaque bounded string", () => {
    expect(occurrenceKeySchema.parse(occurrenceKey)).toBe(occurrenceKey);
    expect(occurrenceKeySchema.parse("o2.11111111111141118111111111111111_abc_def")).toBe(
      "o2.11111111111141118111111111111111_abc_def",
    );
    expect(() => occurrenceKeySchema.parse(`${occurrenceKey}|2026-07-20`)).toThrow();
    expect(() => occurrenceKeySchema.parse("2026-07-20")).toThrow();
    expect(() => occurrenceKeySchema.parse("o3.future-format")).toThrow();
    expect(() => occurrenceKeySchema.parse(`o1.${"a".repeat(80)}`)).toThrow();
  });

  it("keeps one-off and recurring projections explicit and internally consistent", () => {
    expect(
      boundedTaskProjectionSchema.parse({
        projectionKind: "one_off",
        task: task(),
        schedule: {
          taskId,
          kind: "all_day",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    ).toMatchObject({ projectionKind: "one_off" });
    expect(() =>
      boundedTaskProjectionSchema.parse({
        projectionKind: "one_off",
        task: task(),
        schedule: {
          taskId: otherTaskId,
          kind: "all_day",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    ).toThrow(/belong/i);

    const recurring = {
      projectionKind: "recurring",
      task: task(),
      occurrence: {
        taskId,
        taskVersion: 4,
        occurrenceKey,
        occurrenceState: "open",
        transitionEligible: true,
        schedule: {
          kind: "timed",
          startAt: "2026-07-20T09:00:00+08:00",
          endAt: "2026-07-20T10:00:00+08:00",
          timezone: "Asia/Singapore",
        },
      },
    } as const;
    expect(boundedTaskProjectionSchema.parse(recurring)).toMatchObject({
      projectionKind: "recurring",
      occurrence: { occurrenceState: "open", transitionEligible: true },
    });
    expect(() =>
      boundedTaskProjectionSchema.parse({
        ...recurring,
        occurrence: { ...recurring.occurrence, transitionEligible: undefined },
      }),
    ).toThrow();
    expect(() =>
      boundedTaskProjectionSchema.parse({
        ...recurring,
        occurrence: { ...recurring.occurrence, taskId: otherTaskId },
      }),
    ).toThrow(/belong/i);
    expect(() =>
      boundedTaskProjectionSchema.parse({
        ...recurring,
        occurrence: { ...recurring.occurrence, taskVersion: 3 },
      }),
    ).toThrow(/task version/i);
  });

  it("enforces the paired finite date and instant range", () => {
    expect(
      taskOccurrenceRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-09-01",
        rangeStartAt: "2026-06-30T16:00:00Z",
        rangeEndAt: "2026-08-31T16:00:00Z",
      }),
    ).toMatchObject({ limit: 250 });
    expect(() =>
      taskOccurrenceRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-09-02",
        rangeStartAt: "2026-06-30T16:00:00Z",
        rangeEndAt: "2026-08-31T16:00:00Z",
      }),
    ).toThrow(/62 local days/i);
    expect(() =>
      taskOccurrenceRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-07-02",
        rangeStartAt: "2026-07-01T00:00:00Z",
        rangeEndAt: "2026-09-03T00:00:01Z",
      }),
    ).toThrow(/instant range/i);
  });

  it("makes every source, computation, and output truncation explicit", () => {
    expect(
      occurrenceTruncationSchema.parse({
        truncated: true,
        reasons: ["source_limit", "event_source_limit", "output_limit"],
        recurrenceRowsEvaluated: 500,
        occurrenceEventsEvaluated: 42,
        candidateEvaluations: 12_000,
      }),
    ).toMatchObject({ truncated: true });
    expect(() =>
      occurrenceTruncationSchema.parse({
        truncated: false,
        reasons: ["source_limit"],
        recurrenceRowsEvaluated: 500,
        occurrenceEventsEvaluated: 42,
        candidateEvaluations: 1,
      }),
    ).toThrow(/truncation flag/i);
    expect(() =>
      occurrenceTruncationSchema.parse({
        truncated: true,
        reasons: ["source_limit", "source_limit"],
        recurrenceRowsEvaluated: 500,
        occurrenceEventsEvaluated: 42,
        candidateEvaluations: 1,
      }),
    ).toThrow(/unique/i);
    expect(() =>
      occurrenceTruncationSchema.parse({
        truncated: true,
        reasons: ["request_candidate_limit"],
        recurrenceRowsEvaluated: 1,
        occurrenceEventsEvaluated: 42,
        candidateEvaluations: 50_001,
      }),
    ).toThrow();
    expect(() =>
      occurrenceTruncationSchema.parse({
        truncated: true,
        reasons: ["event_source_limit"],
        recurrenceRowsEvaluated: 1,
        occurrenceEventsEvaluated: 50_001,
        candidateEvaluations: 1,
      }),
    ).toThrow();
  });

  it("binds occurrence actions to an opaque key and expected version", () => {
    expect(
      occurrenceCommandRequestSchema.parse({
        action: "complete",
        occurrenceKey,
        expectedVersion: 4,
      }),
    ).toMatchObject({ action: "complete", expectedVersion: 4 });
    expect(() =>
      occurrenceCommandRequestSchema.parse({
        action: "complete",
        occurrenceKey,
        expectedVersion: 4,
        taskId,
      }),
    ).toThrow();
  });

  it("distinguishes applied, exact retry, and no-op version semantics", () => {
    const common = {
      action: "complete",
      occurrenceKey,
      expectedVersion: 4,
      occurrenceState: "completed",
    } as const;
    expect(() =>
      occurrenceCommandResultSchema.parse({
        ...common,
        outcome: "applied",
        task: { id: taskId, version: 5 },
        eventTaskVersion: 5,
      }),
    ).not.toThrow();
    expect(() =>
      occurrenceCommandResultSchema.parse({
        ...common,
        outcome: "idempotent_retry",
        task: { id: taskId, version: 8 },
        eventTaskVersion: 5,
      }),
    ).not.toThrow();
    expect(() =>
      occurrenceCommandResultSchema.parse({
        action: "undo",
        occurrenceKey,
        expectedVersion: 8,
        occurrenceState: "open",
        outcome: "no_op",
        task: { id: taskId, version: 8 },
        eventTaskVersion: 5,
      }),
    ).not.toThrow();
    expect(() =>
      occurrenceCommandResultSchema.parse({
        ...common,
        outcome: "idempotent_retry",
        task: { id: taskId, version: 8 },
        eventTaskVersion: 6,
      }),
    ).toThrow(/expectedVersion/i);
    expect(() =>
      occurrenceCommandResultSchema.parse({
        ...common,
        occurrenceState: "open",
        outcome: "applied",
        task: { id: taskId, version: 5 },
        eventTaskVersion: 5,
      }),
    ).toThrow(/requested action/i);
  });

  it("only treats an exact command version as safe for optimistic projection", () => {
    const common = {
      action: "complete",
      occurrenceKey,
      expectedVersion: 4,
      occurrenceState: "completed",
      eventTaskVersion: 5,
    } as const;

    expect(
      canApplyOccurrenceResultOptimistically({
        ...common,
        outcome: "applied",
        task: { id: taskId, version: 5 },
      }),
    ).toBe(true);
    expect(
      canApplyOccurrenceResultOptimistically({
        ...common,
        outcome: "idempotent_retry",
        task: { id: taskId, version: 5 },
      }),
    ).toBe(true);
    expect(
      canApplyOccurrenceResultOptimistically({
        ...common,
        outcome: "idempotent_retry",
        task: { id: taskId, version: 8 },
      }),
    ).toBe(false);
    expect(
      canApplyOccurrenceResultOptimistically({
        action: "undo",
        occurrenceKey,
        expectedVersion: 8,
        occurrenceState: "open",
        outcome: "no_op",
        task: { id: taskId, version: 8 },
        eventTaskVersion: 5,
      }),
    ).toBe(true);
  });

  it("keeps occurrence failures explicit without accepting client ownership", () => {
    expect(
      occurrenceCommandFailureSchema.parse({
        reason: "stale_version",
        code: "CONFLICT",
        currentVersion: 9,
      }),
    ).toMatchObject({ currentVersion: 9 });
    expect(() =>
      occurrenceCommandFailureSchema.parse({
        reason: "resource_unavailable",
        code: "NOT_FOUND",
        taskId,
      }),
    ).toThrow();
  });
});
