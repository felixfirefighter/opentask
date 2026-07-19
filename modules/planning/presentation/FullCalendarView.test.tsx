import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FullCalendarView } from "./FullCalendarView";
import { calendarFixture } from "./planning-screen-fixtures";

describe("FullCalendarView", () => {
  it("renders standard calendar events as named interactive records", async () => {
    const onVisibleRangeChange = vi.fn();
    render(
      <FullCalendarView
        model={{ ...calendarFixture, view: "agenda" }}
        view="agenda"
        navigation={{ revision: 0, direction: "today" }}
        readOnly={false}
        onOpenTask={vi.fn()}
        onSelectEvent={vi.fn()}
        onVisibleRangeChange={onVisibleRangeChange}
        onEventMove={vi.fn().mockResolvedValue({ ok: true })}
        onEventResize={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    await waitFor(() => expect(onVisibleRangeChange).toHaveBeenCalled());
    expect(
      screen.getByLabelText(/Record the two-minute demo, Monday, 20 July, 10:30–11:30 AM, Open, Launch/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Prepare clean demo data")).toBeInTheDocument();
  });

  it("renders the FullCalendar v7 resize handle for an editable timed event", async () => {
    render(
      <FullCalendarView
        model={{ ...calendarFixture, view: "week" }}
        view="week"
        navigation={{ revision: 0, direction: "today" }}
        readOnly={false}
        onOpenTask={vi.fn()}
        onSelectEvent={vi.fn()}
        onVisibleRangeChange={vi.fn()}
        onEventMove={vi.fn().mockResolvedValue({ ok: true })}
        onEventResize={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    await waitFor(() =>
      expect(document.querySelector('[data-ui="calendar-event-resize-handle"]')).toBeInTheDocument(),
    );
  });
});
