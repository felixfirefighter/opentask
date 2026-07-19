import { act, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FullCalendarView } from "./FullCalendarView";
import { calendarFixture } from "./planning-screen-fixtures";

describe("FullCalendarView", () => {
  it("server-renders a stable placeholder instead of locale-sensitive calendar labels", () => {
    const markup = renderToString(
      <FullCalendarView
        model={{ ...calendarFixture, view: "agenda" }}
        view="agenda"
        navigation={{ revision: 0, direction: "today" }}
        readOnly={false}
        onOpenTask={vi.fn()}
        onSelectEvent={vi.fn()}
        onVisibleRangeChange={vi.fn()}
        onEventMove={vi.fn().mockResolvedValue({ ok: true })}
        onEventResize={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    expect(markup).toContain('data-ui="calendar-client-placeholder"');
    expect(markup).toContain("Preparing calendar…");
    expect(markup).not.toContain('data-ui="fullcalendar-standard-views"');
  });

  it("hydrates the stable placeholder before mounting the browser calendar", async () => {
    const props = {
      model: { ...calendarFixture, view: "agenda" as const },
      view: "agenda" as const,
      navigation: { revision: 0, direction: "today" as const },
      readOnly: false,
      onOpenTask: vi.fn(),
      onSelectEvent: vi.fn(),
      onVisibleRangeChange: vi.fn(),
      onEventMove: vi.fn().mockResolvedValue({ ok: true }),
      onEventResize: vi.fn().mockResolvedValue({ ok: true }),
    };
    const container = document.createElement("div");
    container.innerHTML = renderToString(<FullCalendarView {...props} />);
    document.body.append(container);
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, <FullCalendarView {...props} />, { onRecoverableError });

    await waitFor(() =>
      expect(container.querySelector('[data-ui="fullcalendar-standard-views"]')).toBeInTheDocument(),
    );
    expect(onRecoverableError).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

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
