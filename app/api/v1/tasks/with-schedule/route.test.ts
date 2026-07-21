import type * as TasksModule from "@/modules/tasks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getTasksApplication: vi.fn(),
  createTaskWithSchedule: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof TasksModule>()),
  getTasksApplication: mocks.getTasksApplication,
}));

import { POST } from "./route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const listId = "30000000-0000-4000-8000-000000000001";
const now = "2026-07-20T01:00:00.000Z";
const input = {
  title: "Plan the release",
  listId,
  schedule: { kind: "all_day" as const, startDate: "2026-07-20", endDate: "2026-07-21" },
};
const value = {
  task: {
    id: taskId,
    listId,
    sectionId: null,
    parentTaskId: null,
    title: input.title,
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  },
  schedule: {
    taskId,
    ...input.schedule,
    createdAt: now,
    updatedAt: now,
  },
};

describe("POST /api/v1/tasks/with-schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getTasksApplication.mockReturnValue({
      tasks: { createTaskWithSchedule: mocks.createTaskWithSchedule },
    });
    mocks.createTaskWithSchedule.mockResolvedValue({ created: true, value });
  });

  it("dispatches one authenticated idempotent command and returns the combined resource", async () => {
    const response = await POST(request(input));

    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/api/v1/tasks/${taskId}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createTaskWithSchedule).toHaveBeenCalledWith(actor, taskId, {
      title: input.title,
      descriptionMd: "",
      priority: "none",
      listId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
      schedule: input.schedule,
    });
    await expect(response.json()).resolves.toEqual(value);
  });

  it("returns 200 without a Location header for an exact replay", async () => {
    mocks.createTaskWithSchedule.mockResolvedValueOnce({ created: false, value });
    const response = await POST(request(input));

    expect(response.status).toBe(200);
    expect(response.headers.has("location")).toBe(false);
  });

  it("rejects an invalid schedule, query, origin, or missing create key before dispatch", async () => {
    const cases = [
      request({ ...input, schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-20" } }),
      request(input, { path: "/api/v1/tasks/with-schedule?unexpected=1" }),
      request(input, { origin: "https://attacker.invalid" }),
      request(input, { idempotencyKey: "" }),
    ];

    for (const candidate of cases) {
      const response = await POST(candidate);
      expect([400, 403]).toContain(response.status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.createTaskWithSchedule).not.toHaveBeenCalled();
  });
});

function request(
  body: unknown,
  options: Readonly<{ path?: string; origin?: string; idempotencyKey?: string }> = {},
) {
  const origin = options.origin ?? "http://localhost:3000";
  return new Request(`http://localhost:3000${options.path ?? "/api/v1/tasks/with-schedule"}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": options.idempotencyKey ?? taskId,
      origin,
      "sec-fetch-site": origin === "http://localhost:3000" ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}
