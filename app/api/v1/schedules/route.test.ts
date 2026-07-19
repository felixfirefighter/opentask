import type * as TasksModule from "@/modules/tasks";
import { ApplicationError } from "@/shared/http/application-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getTasksApplication: vi.fn(),
  schedules: {
    getSchedule: vi.fn(),
    setSchedule: vi.fn(),
    clearSchedule: vi.fn(),
    listRange: vi.fn(),
  },
  parseQuickAdd: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof TasksModule>()),
  getTasksApplication: mocks.getTasksApplication,
}));

import { GET as listSchedules } from "./route";
import { GET as getSchedule, PATCH as setSchedule } from "../tasks/[taskId]/schedule/route";
import { POST as clearSchedule } from "../tasks/[taskId]/schedule/clear/route";
import { POST as parseQuickAdd } from "../tasks/quick-add/route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const schedule = {
  taskId,
  kind: "timed" as const,
  startAt: "2026-07-20T01:00:00.000Z",
  endAt: "2026-07-20T02:00:00.000Z",
  timezone: "Asia/Singapore",
  createdAt: "2026-07-19T01:00:00.000Z",
  updatedAt: "2026-07-19T01:00:00.000Z",
};

function context(value = taskId.toUpperCase()) {
  return { params: Promise.resolve({ taskId: value }) };
}

function jsonRequest(
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

describe("schedule API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getTasksApplication.mockReturnValue({
      schedules: mocks.schedules,
      quickAdd: { parseQuickAdd: mocks.parseQuickAdd },
    });
    mocks.schedules.getSchedule.mockResolvedValue(schedule);
    mocks.schedules.setSchedule.mockResolvedValue({ task: { id: taskId, version: 2 }, schedule });
    mocks.schedules.clearSchedule.mockResolvedValue({ task: { id: taskId, version: 3 }, schedule: null });
    mocks.schedules.listRange.mockResolvedValue({ items: [], truncated: false });
    mocks.parseQuickAdd.mockReturnValue({ sourceText: "tomorrow at 9", suggestions: [] });
  });

  it("authenticates and dispatches a strict bounded range without private caching", async () => {
    const request = new Request(
      "http://localhost:3000/api/v1/schedules?rangeStartDate=2026-07-20&rangeEndDate=2026-07-21&rangeStartAt=2026-07-19T16:00:00Z&rangeEndAt=2026-07-20T16:00:00Z&limit=20",
    );
    const response = await listSchedules(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.schedules.listRange).toHaveBeenCalledWith(actor, {
      rangeStartDate: "2026-07-20",
      rangeEndDate: "2026-07-21",
      rangeStartAt: "2026-07-19T16:00:00Z",
      rangeEndAt: "2026-07-20T16:00:00Z",
      limit: 20,
    });
  });

  it("gets, sets, and clears one canonical schedule through the authenticated task ID", async () => {
    const getResponse = await getSchedule(
      new Request(`http://localhost:3000/api/v1/tasks/${taskId}/schedule`),
      context(),
    );
    expect(getResponse.status).toBe(200);
    expect(mocks.schedules.getSchedule).toHaveBeenCalledWith(actor, taskId);

    const setInput = {
      expectedVersion: 1,
      schedule: {
        kind: "timed",
        startAt: "2026-07-20T09:00:00+08:00",
        endAt: "2026-07-20T10:00:00+08:00",
        timezone: "Asia/Singapore",
      },
    } as const;
    const setResponse = await setSchedule(
      jsonRequest(`/api/v1/tasks/${taskId}/schedule`, setInput, "PATCH"),
      context(),
    );
    expect(setResponse.status).toBe(200);
    expect(mocks.schedules.setSchedule).toHaveBeenCalledWith(actor, taskId, setInput);

    const clearResponse = await clearSchedule(
      jsonRequest(`/api/v1/tasks/${taskId}/schedule/clear`, { expectedVersion: 2 }, "POST"),
      context(),
    );
    expect(clearResponse.status).toBe(200);
    expect(mocks.schedules.clearSchedule).toHaveBeenCalledWith(actor, taskId, { expectedVersion: 2 });
  });

  it("parses quick-add text only after authentication and preserves the submitted source", async () => {
    const input = { text: "tomorrow at 9", timezone: "Asia/Singapore" };
    const response = await parseQuickAdd(jsonRequest("/api/v1/tasks/quick-add", input, "POST"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.resolveActor).toHaveBeenCalledOnce();
    expect(mocks.parseQuickAdd).toHaveBeenCalledWith(input);
    await expect(response.json()).resolves.toEqual({ sourceText: input.text, suggestions: [] });
  });

  it("rejects invalid ranges, paths, bodies, queries, and cross-site mutations before dispatch", async () => {
    const invalidRange = await listSchedules(
      new Request(
        "http://localhost:3000/api/v1/schedules?rangeStartDate=2026-07-20&rangeEndDate=2026-07-20&rangeStartAt=2026-07-20T00:00:00Z&rangeEndAt=2026-07-20T01:00:00Z",
      ),
    );
    const invalidPath = await getSchedule(
      new Request("http://localhost:3000/api/v1/tasks/not-an-id/schedule"),
      context("not-an-id"),
    );
    const unknownBody = await setSchedule(
      jsonRequest(`/api/v1/tasks/${taskId}/schedule`, { expectedVersion: 1, unknown: true }, "PATCH"),
      context(),
    );
    const queryOnClear = await clearSchedule(
      jsonRequest(`/api/v1/tasks/${taskId}/schedule/clear?unexpected=1`, { expectedVersion: 1 }, "POST"),
      context(),
    );
    const crossSite = await parseQuickAdd(
      jsonRequest(
        "/api/v1/tasks/quick-add",
        { text: "tomorrow", timezone: "UTC" },
        "POST",
        "https://attacker.invalid",
      ),
    );

    for (const response of [invalidRange, invalidPath, unknownBody, queryOnClear]) {
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(crossSite.status).toBe(403);
    expect(mocks.schedules.listRange).not.toHaveBeenCalled();
    expect(mocks.schedules.setSchedule).not.toHaveBeenCalled();
    expect(mocks.schedules.clearSchedule).not.toHaveBeenCalled();
    expect(mocks.parseQuickAdd).not.toHaveBeenCalled();
  });

  it("returns existence-safe task failures through the private problem contract", async () => {
    mocks.schedules.getSchedule.mockRejectedValueOnce(
      new ApplicationError("NOT_FOUND", "The requested task was not found."),
    );
    const response = await getSchedule(
      new Request(`http://localhost:3000/api/v1/tasks/${taskId}/schedule`),
      context(),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 401 without dispatching any new schedule surface when unauthenticated", async () => {
    mocks.resolveActor.mockRejectedValue(
      Object.assign(new Error("private session detail"), { code: "UNAUTHENTICATED" }),
    );
    const requests = [
      () =>
        listSchedules(
          new Request(
            "http://localhost:3000/api/v1/schedules?rangeStartDate=2026-07-20&rangeEndDate=2026-07-21&rangeStartAt=2026-07-19T16:00:00Z&rangeEndAt=2026-07-20T16:00:00Z",
          ),
        ),
      () => getSchedule(new Request(`http://localhost:3000/api/v1/tasks/${taskId}/schedule`), context()),
      () =>
        setSchedule(
          jsonRequest(
            `/api/v1/tasks/${taskId}/schedule`,
            {
              expectedVersion: 1,
              schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
            },
            "PATCH",
          ),
          context(),
        ),
      () =>
        clearSchedule(
          jsonRequest(`/api/v1/tasks/${taskId}/schedule/clear`, { expectedVersion: 1 }, "POST"),
          context(),
        ),
      () =>
        parseQuickAdd(
          jsonRequest("/api/v1/tasks/quick-add", { text: "tomorrow", timezone: "Asia/Singapore" }, "POST"),
        ),
    ];

    for (const invoke of requests) {
      const response = await invoke();
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.schedules.listRange).not.toHaveBeenCalled();
    expect(mocks.schedules.getSchedule).not.toHaveBeenCalled();
    expect(mocks.schedules.setSchedule).not.toHaveBeenCalled();
    expect(mocks.schedules.clearSchedule).not.toHaveBeenCalled();
    expect(mocks.parseQuickAdd).not.toHaveBeenCalled();
  });
});
