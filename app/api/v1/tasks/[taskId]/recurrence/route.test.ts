import type * as TasksModule from "@/modules/tasks";
import { ApplicationError } from "@/shared/http/application-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getTasksApplication: vi.fn(),
  recurrences: {
    getRecurrence: vi.fn(),
    setRecurrence: vi.fn(),
    editRecurringSchedule: vi.fn(),
    endRecurrence: vi.fn(),
  },
  occurrences: { transitionOccurrence: vi.fn() },
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof TasksModule>()),
  getTasksApplication: mocks.getTasksApplication,
}));

import { GET as getRecurrence, PATCH as setRecurrence } from "./route";
import { POST as endRecurrence } from "./end/route";
import { PATCH as editRecurringSchedule } from "./schedule/route";
import { POST as transitionOccurrence } from "../occurrences/transition/route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const occurrenceKey = "o1.dmFsaWRfa2V5";
const definition = {
  preset: { kind: "daily" as const, interval: 1 },
  end: { kind: "never" as const },
};
const recurrence = {
  taskId,
  taskVersion: 5,
  generationMode: "schedule" as const,
  timezone: "Asia/Singapore",
  definition,
  cutover: {
    kind: "all_day" as const,
    projectionStartDate: "2026-07-21",
    projectionEndDate: null,
  },
  lifecycle: "active" as const,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

function context(value = taskId.toUpperCase()) {
  return { params: Promise.resolve({ taskId: value }) };
}

function mutationRequest(
  path: string,
  body: unknown,
  method: "PATCH" | "POST",
  origin = "http://localhost:3000",
) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "http://localhost:3000" ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

describe("recurrence and occurrence API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getTasksApplication.mockReturnValue({
      recurrences: mocks.recurrences,
      occurrences: mocks.occurrences,
    });
    mocks.recurrences.getRecurrence.mockResolvedValue(recurrence);
    mocks.recurrences.setRecurrence.mockResolvedValue({ task: { id: taskId, version: 5 }, recurrence });
    mocks.recurrences.editRecurringSchedule.mockResolvedValue({
      task: { id: taskId, version: 5 },
      recurrence,
    });
    mocks.recurrences.endRecurrence.mockResolvedValue({
      task: { id: taskId, version: 5 },
      recurrence: {
        ...recurrence,
        lifecycle: "ended",
        cutover: { ...recurrence.cutover, projectionEndDate: "2026-07-22" },
      },
    });
    mocks.occurrences.transitionOccurrence.mockResolvedValue({
      outcome: "applied",
      action: "complete",
      occurrenceKey,
      expectedVersion: 4,
      task: { id: taskId, version: 5 },
      occurrenceState: "completed",
      eventTaskVersion: 5,
    });
  });

  it("authenticates and gets the actor-scoped recurrence without private caching", async () => {
    const response = await getRecurrence(
      new Request(`http://localhost:3000/api/v1/tasks/${taskId}/recurrence`),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.recurrences.getRecurrence).toHaveBeenCalledWith(actor, taskId);
    await expect(response.json()).resolves.toMatchObject({ taskId, lifecycle: "active" });
  });

  it("dispatches strict rule, recurring-schedule, end, and occurrence commands", async () => {
    const setInput = { expectedVersion: 4, definition };
    const scheduleInput = {
      expectedVersion: 4,
      definition,
      schedule: { kind: "all_day" as const, startDate: "2026-07-21", endDate: "2026-07-22" },
    };
    const occurrenceInput = { action: "complete" as const, occurrenceKey, expectedVersion: 4 };

    const responses = await Promise.all([
      setRecurrence(mutationRequest(`/api/v1/tasks/${taskId}/recurrence`, setInput, "PATCH"), context()),
      editRecurringSchedule(
        mutationRequest(`/api/v1/tasks/${taskId}/recurrence/schedule`, scheduleInput, "PATCH"),
        context(),
      ),
      endRecurrence(
        mutationRequest(`/api/v1/tasks/${taskId}/recurrence/end`, { expectedVersion: 4 }, "POST"),
        context(),
      ),
      transitionOccurrence(
        mutationRequest(`/api/v1/tasks/${taskId}/occurrences/transition`, occurrenceInput, "POST"),
        context(),
      ),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
    for (const response of responses) expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.recurrences.setRecurrence).toHaveBeenCalledWith(actor, taskId, setInput);
    expect(mocks.recurrences.editRecurringSchedule).toHaveBeenCalledWith(actor, taskId, scheduleInput);
    expect(mocks.recurrences.endRecurrence).toHaveBeenCalledWith(actor, taskId, {
      expectedVersion: 4,
    });
    expect(mocks.occurrences.transitionOccurrence).toHaveBeenCalledWith(actor, taskId, occurrenceInput);
  });

  it("rejects bad paths, queries, strict bodies, oversized bodies, and cross-site writes", async () => {
    const oversized = { expectedVersion: 4, definition, padding: "x".repeat(5_000) };
    const responses = await Promise.all([
      getRecurrence(
        new Request(`http://localhost:3000/api/v1/tasks/${taskId}/recurrence?unexpected=1`),
        context(),
      ),
      getRecurrence(
        new Request("http://localhost:3000/api/v1/tasks/not-an-id/recurrence"),
        context("not-an-id"),
      ),
      setRecurrence(
        mutationRequest(`/api/v1/tasks/${taskId}/recurrence`, { expectedVersion: 4, unknown: true }, "PATCH"),
        context(),
      ),
      setRecurrence(mutationRequest(`/api/v1/tasks/${taskId}/recurrence`, oversized, "PATCH"), context()),
      endRecurrence(
        mutationRequest(
          `/api/v1/tasks/${taskId}/recurrence/end?unexpected=1`,
          { expectedVersion: 4 },
          "POST",
        ),
        context(),
      ),
      transitionOccurrence(
        mutationRequest(
          `/api/v1/tasks/${taskId}/occurrences/transition`,
          { action: "remove", occurrenceKey, expectedVersion: 4 },
          "POST",
        ),
        context(),
      ),
      editRecurringSchedule(
        mutationRequest(
          `/api/v1/tasks/${taskId}/recurrence/schedule`,
          { expectedVersion: 4, definition, schedule: null },
          "PATCH",
          "https://attacker.invalid",
        ),
        context(),
      ),
    ]);

    expect(responses.slice(0, 6).map(({ status }) => status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(responses[6]?.status).toBe(403);
    expect(mocks.recurrences.getRecurrence).not.toHaveBeenCalled();
    expect(mocks.recurrences.setRecurrence).not.toHaveBeenCalled();
    expect(mocks.recurrences.endRecurrence).not.toHaveBeenCalled();
    expect(mocks.recurrences.editRecurringSchedule).not.toHaveBeenCalled();
    expect(mocks.occurrences.transitionOccurrence).not.toHaveBeenCalled();
  });

  it("returns private application problems with optimistic-conflict metadata", async () => {
    mocks.recurrences.setRecurrence.mockRejectedValueOnce(
      new ApplicationError("CONFLICT", "The task changed elsewhere.", { currentVersion: 7 }),
    );
    const response = await setRecurrence(
      mutationRequest(`/api/v1/tasks/${taskId}/recurrence`, { expectedVersion: 4, definition }, "PATCH"),
      context(),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "CONFLICT", currentVersion: 7 });
  });

  it("returns 401 without dispatching any recurrence or occurrence surface", async () => {
    mocks.resolveActor.mockRejectedValue(
      Object.assign(new Error("private session detail"), { code: "UNAUTHENTICATED" }),
    );
    const responses = await Promise.all([
      getRecurrence(new Request(`http://localhost:3000/api/v1/tasks/${taskId}/recurrence`), context()),
      setRecurrence(
        mutationRequest(`/api/v1/tasks/${taskId}/recurrence`, { expectedVersion: 4, definition }, "PATCH"),
        context(),
      ),
      endRecurrence(
        mutationRequest(`/api/v1/tasks/${taskId}/recurrence/end`, { expectedVersion: 4 }, "POST"),
        context(),
      ),
      transitionOccurrence(
        mutationRequest(
          `/api/v1/tasks/${taskId}/occurrences/transition`,
          { action: "skip", occurrenceKey, expectedVersion: 4 },
          "POST",
        ),
        context(),
      ),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401]);
    expect(mocks.recurrences.getRecurrence).not.toHaveBeenCalled();
    expect(mocks.recurrences.setRecurrence).not.toHaveBeenCalled();
    expect(mocks.recurrences.endRecurrence).not.toHaveBeenCalled();
    expect(mocks.occurrences.transitionOccurrence).not.toHaveBeenCalled();
  });
});
