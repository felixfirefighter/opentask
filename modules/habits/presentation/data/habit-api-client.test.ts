import { afterEach, describe, expect, it, vi } from "vitest";

import {
  habitDetail,
  habitMonth,
  habitOverview,
  habitTodayRow,
  TEST_HABIT_ID,
} from "../habit-presentation-test-support";
import {
  archiveHabit,
  getHabitOverview,
  getHabitMonth,
  getHabitToday,
  listHabitOverviews,
  setHabitSchedule,
} from "./habit-api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("habit API client", () => {
  it("loads one overview through its actor-scoped detail subresource", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(habitOverview()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHabitOverview(TEST_HABIT_ID)).resolves.toMatchObject({
      detail: { habit: { id: TEST_HABIT_ID } },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/habits/${TEST_HABIT_ID}/overview`);
  });

  it("loads lifecycle-filtered overviews from the frozen collection route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [habitOverview()], nextCursor: "next_page" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listHabitOverviews({ lifecycle: "archived", limit: 25, cursor: "current_page" }),
    ).resolves.toMatchObject({ items: [{ detail: { habit: { title: "Morning walk" } } }] });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://opentask.local");
    expect(requestUrl.pathname).toBe("/api/v1/habits/overviews");
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      cursor: "current_page",
      limit: "25",
      lifecycle: "archived",
    });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: "same-origin" }));
  });

  it("sends an optimistic version with schedule and lifecycle writes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(habitDetail()))
      .mockResolvedValueOnce(Response.json(habitDetail({ archivedAt: "2026-07-20T02:00:00.000Z" })));
    vi.stubGlobal("fetch", fetchMock);
    const schedule = habitDetail().schedule.schedule;

    await setHabitSchedule(TEST_HABIT_ID, 4, schedule);
    await archiveHabit(TEST_HABIT_ID, 5);

    const [schedulePath, scheduleInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(schedulePath).toBe(`/api/v1/habits/${TEST_HABIT_ID}/schedule`);
    expect(scheduleInit.method).toBe("PATCH");
    expect(JSON.parse(String(scheduleInit.body))).toEqual({ expectedVersion: 4, schedule });
    const [archivePath, archiveInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(archivePath).toBe(`/api/v1/habits/${TEST_HABIT_ID}/archive`);
    expect(JSON.parse(String(archiveInit.body))).toEqual({ expectedVersion: 5 });
  });

  it("requests one bounded month through the detail subresource", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(habitMonth()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHabitMonth(TEST_HABIT_ID, { yearMonth: "2026-07" })).resolves.toEqual(habitMonth());

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/habits/${TEST_HABIT_ID}/month?yearMonth=2026-07`);
  });

  it("loads Today rows with every active timezone boundary", async () => {
    const projection = {
      rows: [habitTodayRow()],
      boundaries: [{ timezone: "Asia/Singapore", localDate: "2026-07-20" }],
      nextCursor: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(projection));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHabitToday({ limit: 50 })).resolves.toEqual(projection);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/habits/today?limit=50");
  });
});
