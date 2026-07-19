import { describe, expect, it } from "vitest";

import { readCalendarRouteState } from "./calendar-route-query";

describe("calendar route query", () => {
  it("derives bounded month, week, day, and agenda ranges from the saved local date", () => {
    expect(readCalendarRouteState({}, "2026-07-19", 1)).toMatchObject({
      view: "month",
      hasSavedView: false,
      initialDate: "2026-07-19",
      rangeStartDate: "2026-07-01",
      rangeEndDate: "2026-08-01",
    });
    expect(readCalendarRouteState({ view: "week" }, "2026-07-19", 1)).toMatchObject({
      view: "week",
      hasSavedView: true,
      rangeStartDate: "2026-07-13",
      rangeEndDate: "2026-07-20",
    });
    expect(readCalendarRouteState({ view: "day" }, "2026-07-19", 0)).toMatchObject({
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-07-20",
    });
    expect(readCalendarRouteState({ view: "agenda" }, "2026-07-19", 0)).toMatchObject({
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-07-26",
    });
  });

  it("accepts a valid visible range and rejects invalid, repeated, or unbounded query values", () => {
    expect(
      readCalendarRouteState(
        {
          view: "agenda",
          date: "2026-08-10",
          rangeStartDate: "2026-08-01",
          rangeEndDate: "2026-08-31",
        },
        "2026-07-19",
        1,
      ),
    ).toMatchObject({
      view: "agenda",
      initialDate: "2026-08-10",
      rangeStartDate: "2026-08-01",
      rangeEndDate: "2026-08-31",
    });

    expect(
      readCalendarRouteState(
        {
          view: ["day", "month"],
          date: "not-a-date",
          rangeStartDate: "2026-01-01",
          rangeEndDate: "2026-12-31",
        },
        "2026-07-19",
        1,
      ),
    ).toMatchObject({
      view: "month",
      hasSavedView: false,
      initialDate: "2026-07-19",
      rangeStartDate: "2026-07-01",
      rangeEndDate: "2026-08-01",
    });
  });
});
