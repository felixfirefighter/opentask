import { describe, expect, it } from "vitest";

import {
  calendarEventAccessibleLabel,
  fromFullCalendarView,
  toFullCalendarEvent,
} from "./calendar-event-mapping";
import { calendarFixture } from "./planning-screen-fixtures";

describe("calendar event presentation mapping", () => {
  it("preserves exclusive all-day date strings without inventing a schedule timezone", () => {
    const allDay = calendarFixture.events.find((event) => event.allDay)!;
    const input = toFullCalendarEvent(allDay, true);

    expect(input.start).toBe("2026-07-21");
    expect(input.end).toBe("2026-07-22");
    expect(input.allDay).toBe(true);
    expect(input).not.toHaveProperty("timeZone");
  });

  it("marks conflicted events read-only and names the conflict", () => {
    const event = { ...calendarFixture.events[0]!, conflicted: true };
    expect(toFullCalendarEvent(event, true).editable).toBe(false);
    expect(calendarEventAccessibleLabel(event)).toContain("changed elsewhere");
  });

  it("uses projection identity and keeps recurring events non-draggable with a named reason", () => {
    const event = {
      ...calendarFixture.events[0]!,
      projectionId: "occurrence:task-demo:occurrence-1",
      projectionLifecycle: "recurring_occurrence" as const,
      occurrenceKey: "occurrence-1",
      occurrenceState: "completed" as const,
      scheduleInteraction: {
        editScope: "series" as const,
        dragEnabled: false,
        dragDisabledReason:
          "Per-occurrence rescheduling is not available. Edit the future series schedule instead.",
      },
      statusLabel: "Completed occurrence",
      categoryLabel: "Recurring task",
    };

    expect(toFullCalendarEvent(event, true)).toMatchObject({
      id: "occurrence:task-demo:occurrence-1",
      editable: false,
    });
    expect(calendarEventAccessibleLabel(event)).toContain("Completed occurrence");
    expect(calendarEventAccessibleLabel(event)).toContain("Per-occurrence rescheduling is not available");
  });

  it("maps only the four standard calendar views", () => {
    expect(fromFullCalendarView("timeGridWeek")).toBe("week");
    expect(fromFullCalendarView("timeGridDay")).toBe("day");
    expect(fromFullCalendarView("listWeek")).toBe("agenda");
    expect(fromFullCalendarView("unsupportedView")).toBe("month");
  });
});
