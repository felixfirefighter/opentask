import type * as HabitsModule from "@/modules/habits";
import { ApplicationError } from "@/shared/http/application-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveHabit: vi.fn(),
  createHabit: vi.fn(),
  editHabitDay: vi.fn(),
  getHabit: vi.fn(),
  getHabitHistory: vi.fn(),
  getHabitMonth: vi.fn(),
  getHabitOverview: vi.fn(),
  getHabitStreaks: vi.fn(),
  getHabitToday: vi.fn(),
  getHabitsApplication: vi.fn(),
  listHabitOverviews: vi.fn(),
  listHabits: vi.fn(),
  recordHabitDay: vi.fn(),
  resolveActor: vi.fn(),
  restoreHabit: vi.fn(),
  setHabitSchedule: vi.fn(),
  undoHabitDay: vi.fn(),
  updateHabit: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/habits", async (importOriginal) => ({
  ...(await importOriginal<typeof HabitsModule>()),
  getHabitsApplication: mocks.getHabitsApplication,
}));

import { GET as getHabit, PATCH as patchHabit } from "./[habitId]/route";
import { POST as archiveHabit } from "./[habitId]/archive/route";
import { GET as getHistory } from "./[habitId]/history/route";
import { PATCH as editLog } from "./[habitId]/logs/[localDate]/route";
import { POST as undoLog } from "./[habitId]/logs/[localDate]/undo/route";
import { POST as recordLog } from "./[habitId]/logs/route";
import { GET as getMonth } from "./[habitId]/month/route";
import { GET as getOverview } from "./[habitId]/overview/route";
import { POST as restoreHabit } from "./[habitId]/restore/route";
import { PATCH as setSchedule } from "./[habitId]/schedule/route";
import { GET as getStreaks } from "./[habitId]/streaks/route";
import { GET as getOverviews } from "./overviews/route";
import { GET as listHabits, POST as createHabit } from "./route";
import { GET as getToday } from "./today/route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const habitId = "20000000-0000-4000-8000-000000000001";
const logId = "30000000-0000-4000-8000-000000000001";
const localDate = "2026-07-20";
const createInput = {
  title: "Morning reset",
  icon: "☀️",
  colorToken: "amber" as const,
  goal: { goalKind: "boolean" as const, targetValue: null, unit: null },
  schedule: {
    kind: "daily" as const,
    weekdays: null,
    targetPerWeek: null,
    timezone: "Asia/Singapore",
    startDate: localDate,
    endDate: null,
  },
};

describe("habit API route matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getHabitsApplication.mockReturnValue({
      definitions: {
        archiveHabit: mocks.archiveHabit,
        createHabit: mocks.createHabit,
        getHabit: mocks.getHabit,
        listHabits: mocks.listHabits,
        restoreHabit: mocks.restoreHabit,
        updateHabit: mocks.updateHabit,
      },
      schedules: { setHabitSchedule: mocks.setHabitSchedule },
      logs: {
        editHabitDay: mocks.editHabitDay,
        recordHabitDay: mocks.recordHabitDay,
        undoHabitDay: mocks.undoHabitDay,
      },
      projections: {
        getHabitHistory: mocks.getHabitHistory,
        getHabitMonth: mocks.getHabitMonth,
        getHabitOverview: mocks.getHabitOverview,
        getHabitStreaks: mocks.getHabitStreaks,
        getHabitToday: mocks.getHabitToday,
        listHabitOverviews: mocks.listHabitOverviews,
      },
    });
    for (const mutation of [
      mocks.archiveHabit,
      mocks.editHabitDay,
      mocks.restoreHabit,
      mocks.setHabitSchedule,
      mocks.undoHabitDay,
      mocks.updateHabit,
    ]) {
      mutation.mockResolvedValue({ id: habitId });
    }
    mocks.getHabitHistory.mockResolvedValue({ habitId, days: [] });
    mocks.getHabitMonth.mockResolvedValue({ habitId, days: [] });
    mocks.getHabitStreaks.mockResolvedValue({ habitId, current: 0, best: 0 });
    mocks.getHabitOverview.mockResolvedValue({ detail: { habit: { id: habitId } } });
    mocks.getHabitToday.mockResolvedValue({ rows: [], boundaries: [], nextCursor: null });
    mocks.listHabitOverviews.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("lists and idempotently creates actor-owned habits", async () => {
    mocks.listHabits.mockResolvedValue({ items: [{ id: habitId }], nextCursor: null });
    const listResponse = await listHabits(getRequest("/api/v1/habits?lifecycle=archived"));

    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("cache-control")).toBe("no-store");
    await expect(listResponse.json()).resolves.toEqual({ items: [{ id: habitId }], nextCursor: null });
    expect(mocks.listHabits).toHaveBeenCalledWith(actor, { limit: 50, lifecycle: "archived" });

    mocks.createHabit.mockResolvedValue({ created: true, value: { id: habitId } });
    const createResponse = await createHabit(
      mutationRequest("/api/v1/habits", "POST", createInput, { "idempotency-key": habitId }),
    );

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("location")).toBe(`/api/v1/habits/${habitId}`);
    expect(mocks.createHabit).toHaveBeenCalledWith(actor, habitId, createInput);

    mocks.createHabit.mockResolvedValueOnce({ created: false, value: { id: habitId } });
    const replay = await createHabit(
      mutationRequest("/api/v1/habits", "POST", createInput, { "idempotency-key": habitId }),
    );
    expect(replay.status).toBe(200);
    expect(replay.headers.has("location")).toBe(false);
  });

  it("gets and updates definitions, schedules, and lifecycle with optimistic versions", async () => {
    const context = habitContext();
    mocks.getHabit.mockResolvedValue({ id: habitId });
    expect((await getHabit(getRequest(`/api/v1/habits/${habitId}`), context)).status).toBe(200);
    expect(mocks.getHabit).toHaveBeenCalledWith(actor, habitId);

    const updateInput = { expectedVersion: 2, patch: { title: "Morning reset gently" } };
    const updateResponse = await patchHabit(
      mutationRequest(`/api/v1/habits/${habitId}`, "PATCH", updateInput),
      habitContext(),
    );
    expect(updateResponse.status).toBe(200);
    expect(mocks.updateHabit).toHaveBeenCalledWith(actor, habitId, updateInput);

    const lifecycleInput = { expectedVersion: 3 };
    const archiveResponse = await archiveHabit(
      mutationRequest(`/api/v1/habits/${habitId}/archive`, "POST", lifecycleInput),
      habitContext(),
    );
    const restoreResponse = await restoreHabit(
      mutationRequest(`/api/v1/habits/${habitId}/restore`, "POST", lifecycleInput),
      habitContext(),
    );
    expect(archiveResponse.status).toBe(200);
    expect(restoreResponse.status).toBe(200);
    expect(mocks.archiveHabit).toHaveBeenCalledWith(actor, habitId, lifecycleInput);
    expect(mocks.restoreHabit).toHaveBeenCalledWith(actor, habitId, lifecycleInput);

    const scheduleInput = { expectedVersion: 4, schedule: createInput.schedule };
    const scheduleResponse = await setSchedule(
      mutationRequest(`/api/v1/habits/${habitId}/schedule`, "PATCH", scheduleInput),
      habitContext(),
    );
    expect(scheduleResponse.status).toBe(200);
    expect(mocks.setHabitSchedule).toHaveBeenCalledWith(actor, habitId, scheduleInput);
  });

  it("records, edits, and undoes the single effective local-day log", async () => {
    const value = { state: "completed" as const, quantity: null, note: "Started calmly." };
    const recordInput = { localDate, value };
    mocks.recordHabitDay.mockResolvedValue({ outcome: "created", log: { id: logId } });

    const created = await recordLog(
      mutationRequest(`/api/v1/habits/${habitId}/logs`, "POST", recordInput, {
        "idempotency-key": logId,
      }),
      habitContext(),
    );
    expect(created.status).toBe(201);
    expect(created.headers.get("location")).toBe(`/api/v1/habits/${habitId}/logs/${localDate}`);
    expect(mocks.recordHabitDay).toHaveBeenCalledWith(actor, habitId, logId, recordInput);

    const editInput = { expectedVersion: 1, value: { ...value, note: "Edited note" } };
    const editResponse = await editLog(
      mutationRequest(`/api/v1/habits/${habitId}/logs/${localDate}`, "PATCH", editInput),
      logContext(),
    );
    expect(editResponse.status).toBe(200);
    expect(mocks.editHabitDay).toHaveBeenCalledWith(actor, habitId, localDate, editInput);

    const undoInput = { expectedVersion: 2 };
    const undoResponse = await undoLog(
      mutationRequest(`/api/v1/habits/${habitId}/logs/${localDate}/undo`, "POST", undoInput),
      logContext(),
    );
    expect(undoResponse.status).toBe(200);
    expect(mocks.undoHabitDay).toHaveBeenCalledWith(actor, habitId, localDate, undoInput);
  });

  it("exposes bounded Today, overview pages, one overview, history, streak, and month projections", async () => {
    const responses = await Promise.all([
      getToday(getRequest("/api/v1/habits/today?limit=25&cursor=current_page")),
      getOverviews(getRequest("/api/v1/habits/overviews?lifecycle=archived&limit=25")),
      getOverview(getRequest(`/api/v1/habits/${habitId}/overview`), habitContext()),
      getHistory(
        getRequest(`/api/v1/habits/${habitId}/history?startDate=2026-07-01&endDate=2026-07-20`),
        habitContext(),
      ),
      getStreaks(getRequest(`/api/v1/habits/${habitId}/streaks`), habitContext()),
      getMonth(getRequest(`/api/v1/habits/${habitId}/month?yearMonth=2026-07`), habitContext()),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200, 200]);
    await expect(responses[0]!.json()).resolves.toEqual({
      rows: [],
      boundaries: [],
      nextCursor: null,
    });

    expect(mocks.getHabitToday).toHaveBeenCalledWith(actor, { limit: 25, cursor: "current_page" });
    expect(mocks.listHabitOverviews).toHaveBeenCalledWith(actor, {
      lifecycle: "archived",
      limit: 25,
    });
    expect(mocks.getHabitOverview).toHaveBeenCalledWith(actor, habitId);
    expect(mocks.getHabitHistory).toHaveBeenCalledWith(actor, habitId, {
      startDate: "2026-07-01",
      endDate: "2026-07-20",
    });
    expect(mocks.getHabitStreaks).toHaveBeenCalledWith(actor, habitId);
    expect(mocks.getHabitMonth).toHaveBeenCalledWith(actor, habitId, { yearMonth: "2026-07" });
  });

  it("returns the canonical 400 problem when a continuation cursor has expired", async () => {
    const cursorError = new ApplicationError(
      "VALIDATION_FAILED",
      "The habit page cursor is invalid or expired.",
    );
    mocks.getHabitToday.mockRejectedValueOnce(cursorError);
    mocks.listHabitOverviews.mockRejectedValueOnce(cursorError);

    const [todayResponse, overviewsResponse] = await Promise.all([
      getToday(getRequest("/api/v1/habits/today?cursor=expired_page")),
      getOverviews(getRequest("/api/v1/habits/overviews?cursor=expired_page")),
    ]);

    for (const response of [todayResponse, overviewsResponse]) {
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        status: 400,
        code: "VALIDATION_FAILED",
        detail: "The habit page cursor is invalid or expired.",
      });
    }
  });

  it("denies every habit read and mutation surface without leaking authentication detail", async () => {
    mocks.resolveActor.mockRejectedValue(
      Object.assign(new Error("private authentication detail"), { code: "UNAUTHENTICATED" }),
    );
    const lifecycleInput = { expectedVersion: 1 };
    const logValue = { state: "completed" as const, quantity: null, note: null };
    const requests = [
      () => listHabits(getRequest("/api/v1/habits")),
      () =>
        createHabit(mutationRequest("/api/v1/habits", "POST", createInput, { "idempotency-key": habitId })),
      () => getHabit(getRequest(`/api/v1/habits/${habitId}`), habitContext()),
      () =>
        patchHabit(
          mutationRequest(`/api/v1/habits/${habitId}`, "PATCH", {
            expectedVersion: 1,
            patch: { title: "Private draft" },
          }),
          habitContext(),
        ),
      () =>
        archiveHabit(
          mutationRequest(`/api/v1/habits/${habitId}/archive`, "POST", lifecycleInput),
          habitContext(),
        ),
      () =>
        restoreHabit(
          mutationRequest(`/api/v1/habits/${habitId}/restore`, "POST", lifecycleInput),
          habitContext(),
        ),
      () =>
        setSchedule(
          mutationRequest(`/api/v1/habits/${habitId}/schedule`, "PATCH", {
            expectedVersion: 1,
            schedule: createInput.schedule,
          }),
          habitContext(),
        ),
      () =>
        recordLog(
          mutationRequest(
            `/api/v1/habits/${habitId}/logs`,
            "POST",
            { localDate, value: logValue },
            { "idempotency-key": logId },
          ),
          habitContext(),
        ),
      () =>
        editLog(
          mutationRequest(`/api/v1/habits/${habitId}/logs/${localDate}`, "PATCH", {
            expectedVersion: 1,
            value: logValue,
          }),
          logContext(),
        ),
      () =>
        undoLog(
          mutationRequest(`/api/v1/habits/${habitId}/logs/${localDate}/undo`, "POST", lifecycleInput),
          logContext(),
        ),
      () => getToday(getRequest("/api/v1/habits/today")),
      () => getOverviews(getRequest("/api/v1/habits/overviews?lifecycle=active")),
      () => getOverview(getRequest(`/api/v1/habits/${habitId}/overview`), habitContext()),
      () =>
        getHistory(
          getRequest(`/api/v1/habits/${habitId}/history?startDate=2026-07-01&endDate=${localDate}`),
          habitContext(),
        ),
      () => getStreaks(getRequest(`/api/v1/habits/${habitId}/streaks`), habitContext()),
      () => getMonth(getRequest(`/api/v1/habits/${habitId}/month?yearMonth=2026-07`), habitContext()),
    ];

    for (const request of requests) {
      const response = await request();
      expect(response.status).toBe(401);
      const body = await response.text();
      expect(body).toContain('"code":"UNAUTHENTICATED"');
      expect(body).not.toContain("private authentication detail");
    }
  });

  it("rejects untrusted writes, duplicate queries, and malformed identifiers before dispatch", async () => {
    const untrusted = new Request("http://localhost:3000/api/v1/habits", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": habitId },
      body: JSON.stringify(createInput),
    });
    expect((await createHabit(untrusted)).status).toBe(403);

    expect((await listHabits(getRequest("/api/v1/habits?lifecycle=active&lifecycle=archived"))).status).toBe(
      400,
    );
    expect(
      (
        await getHabit(getRequest("/api/v1/habits/not-a-uuid"), {
          params: Promise.resolve({ habitId: "not-a-uuid" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (await getOverview(getRequest(`/api/v1/habits/${habitId}/overview?unsupported=true`), habitContext()))
        .status,
    ).toBe(400);
    expect(mocks.createHabit).not.toHaveBeenCalled();
    expect(mocks.getHabitOverview).not.toHaveBeenCalled();
  });
});

function getRequest(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

function mutationRequest(
  path: string,
  method: "PATCH" | "POST",
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function habitContext() {
  return { params: Promise.resolve({ habitId }) };
}

function logContext() {
  return { params: Promise.resolve({ habitId, localDate }) };
}
