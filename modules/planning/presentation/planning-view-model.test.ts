import { describe, expect, it } from "vitest";

import type { CalendarProjection, TodayProjection } from "../application/public";
import { toCalendarPlanningModel, toTodayPlanningModel } from "./planning-view-model";

const TASK_ID = "352493c8-1e29-4dc1-bde7-bffac1c190d2";
const LIST_ID = "09d7cb40-9c45-43fc-bb2a-0fa62e920d96";

describe("planning conflict view models", () => {
  it("decorates only the affected task row as conflicted", () => {
    const projection: TodayProjection = {
      localDate: "2026-07-20",
      timeZone: "Asia/Singapore",
      nowAt: "2026-07-20T01:00:00.000Z",
      overdue: [],
      timed: [],
      anytime: [
        {
          id: TASK_ID,
          listId: LIST_ID,
          title: "Alpha",
          status: "open",
          priority: "high",
          rank: "a",
          version: 2,
          schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
        },
      ],
      remainingCount: 1,
      truncated: false,
    };

    const model = toTodayPlanningModel(projection, {
      conflictedTaskId: TASK_ID,
      hourCycle: "12",
      taskReturnTo: "/today",
    });

    expect(model.anytime[0]).toMatchObject({
      id: TASK_ID,
      conflicted: true,
      detailsHref: `/tasks/${TASK_ID}?returnTo=%2Ftoday`,
    });
  });

  it("makes the affected calendar event visibly read-only after a conflict", () => {
    const projection: CalendarProjection = {
      rangeStartDate: "2026-07-20",
      rangeEndDate: "2026-07-27",
      rangeStartAt: "2026-07-19T16:00:00.000Z",
      rangeEndAt: "2026-07-26T16:00:00.000Z",
      timeZone: "Asia/Singapore",
      events: [
        {
          taskId: TASK_ID,
          listId: LIST_ID,
          title: "Alpha",
          status: "open",
          priority: "high",
          version: 2,
          kind: "all_day",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
        },
      ],
      truncated: false,
    };

    const model = toCalendarPlanningModel(projection, {
      conflictedTaskId: TASK_ID,
      hasSavedView: true,
      hourCycle: "12",
      initialDate: "2026-07-20",
      taskReturnTo: "/calendar?view=week&date=2026-07-20",
      view: "month",
      weekStartsOn: 1,
    });

    expect(model.events[0]).toMatchObject({
      taskId: TASK_ID,
      conflicted: true,
      detailsHref: `/tasks/${TASK_ID}?returnTo=%2Fcalendar%3Fview%3Dweek%26date%3D2026-07-20`,
    });
  });
});
