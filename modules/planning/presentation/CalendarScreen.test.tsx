import type { CalendarOptions, EventDropInfo } from "@fullcalendar/react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarScreen, type CalendarScreenProps } from "./CalendarScreen";
import { calendarFixture } from "./planning-screen-fixtures";

const calendarMock = vi.hoisted(() => ({ latest: null as CalendarOptions | null }));

vi.mock("@fullcalendar/react", () => ({
  default: (props: CalendarOptions) => {
    calendarMock.latest = props;
    const events = Array.isArray(props.events) ? props.events : [];
    return (
      <div data-testid="fullcalendar" data-view={props.initialView}>
        {events.map((event, index) => (
          <span key={typeof event === "object" && "id" in event ? String(event.id) : index}>
            {typeof event === "object" && "title" in event ? String(event.title) : "Event"}
          </span>
        ))}
      </div>
    );
  },
}));
vi.mock("@fullcalendar/react/daygrid", () => ({ default: { name: "daygrid" } }));
vi.mock("@fullcalendar/react/timegrid", () => ({ default: { name: "timegrid" } }));
vi.mock("@fullcalendar/react/list", () => ({ default: { name: "list" } }));
vi.mock("@fullcalendar/react/interaction", () => ({ default: { name: "interaction" } }));

afterEach(() => setMobile(false));

describe("CalendarScreen", () => {
  it("uses all four standard plugins and exposes a bounded visible-range callback", () => {
    const { props } = renderCalendar();
    expect(calendarMock.latest?.plugins).toHaveLength(4);
    expect(screen.getByTestId("fullcalendar")).toHaveAttribute("data-view", "dayGridMonth");

    act(() => {
      calendarMock.latest?.datesSet?.({
        start: new Date("2026-07-01T00:00:00.000Z"),
        end: new Date("2026-08-01T00:00:00.000Z"),
        startStr: "2026-07-01",
        endStr: "2026-08-01",
        timeZone: "Asia/Singapore",
        view: { type: "dayGridMonth" },
      } as Parameters<NonNullable<CalendarOptions["datesSet"]>>[0]);
    });
    expect(props.onVisibleRangeChange).toHaveBeenCalledWith({
      start: "2026-07-01",
      end: "2026-08-01",
      view: "month",
    });
  });

  it("defaults a new mobile visit to Agenda while respecting a saved view", () => {
    setMobile(true);
    const first = renderCalendar();
    expect(screen.getByRole("button", { name: "Agenda" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("fullcalendar")).toHaveAttribute("data-view", "listWeek");
    first.unmount();

    renderCalendar({ model: { ...calendarFixture, hasSavedView: true, view: "week" } });
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("fullcalendar")).toHaveAttribute("data-view", "timeGridWeek");
  });

  it("offers an explicit schedule form path without requiring drag", async () => {
    const user = userEvent.setup();
    const onEditSchedule = vi.fn();
    renderCalendar({ onEditSchedule });

    await user.selectOptions(screen.getByRole("combobox", { name: "Task to edit" }), "event-demo");
    await user.click(screen.getByRole("button", { name: "Edit schedule" }));
    expect(onEditSchedule).toHaveBeenCalledWith("task-demo");
  });

  it("reverts a rejected pointer move and names what was restored", async () => {
    const onEventMove = vi.fn().mockResolvedValue({ ok: false, message: "The task changed elsewhere." });
    renderCalendar({ onEventMove });
    const revert = vi.fn();
    const focus = vi.fn();
    const event = calendarFixture.events[0]!;
    await act(async () => {
      await calendarMock.latest?.eventDrop?.({
        event: {
          id: event.id,
          startStr: "2026-07-20T12:00:00+08:00",
          endStr: "2026-07-20T13:00:00+08:00",
          allDay: false,
        },
        el: { focus },
        revert,
      } as unknown as EventDropInfo);
    });
    expect(revert).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("returned to its saved time");
  });

  it("keeps orientation for empty/loading/error and hides events for permission", async () => {
    const user = userEvent.setup();
    const empty = renderCalendar({ model: { ...calendarFixture, events: [] } });
    expect(screen.getByText("No scheduled tasks in this range")).toBeInTheDocument();
    expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    empty.unmount();

    const loading = renderCalendar({ condition: { kind: "loading" } });
    expect(screen.getByText("Loading this calendar range…")).toBeInTheDocument();
    loading.unmount();

    const onRetry = vi.fn();
    const error = renderCalendar({ condition: { kind: "error" }, onRetry });
    expect(screen.getByText("Record the two-minute demo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    error.unmount();

    const emptyError = renderCalendar({
      condition: { kind: "error" },
      model: { ...calendarFixture, events: [] },
    });
    expect(screen.getByText("Calendar data is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No scheduled tasks in this range")).not.toBeInTheDocument();
    emptyError.unmount();

    renderCalendar({ condition: { kind: "permission" } });
    expect(screen.queryByTestId("fullcalendar")).not.toBeInTheDocument();
    expect(screen.queryByText("Record the two-minute demo")).not.toBeInTheDocument();
  });

  it("keeps loaded events read-only offline and identifies conflicts", async () => {
    const user = userEvent.setup();
    const offline = renderCalendar({ condition: { kind: "offline" } });
    expect(screen.getByRole("button", { name: "Previous range" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Task to edit" }), "event-demo");
    expect(screen.getByRole("button", { name: "Edit schedule" })).toBeDisabled();
    expect(screen.getByText("Record the two-minute demo")).toBeInTheDocument();
    offline.unmount();

    renderCalendar({
      condition: { kind: "conflict" },
      model: {
        ...calendarFixture,
        events: [{ ...calendarFixture.events[0]!, conflicted: true }],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("A task changed elsewhere");
    expect(calendarMock.latest?.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "event-demo", editable: false })]),
    );
  });
});

function renderCalendar(overrides: Partial<CalendarScreenProps> = {}) {
  const props: CalendarScreenProps = {
    model: calendarFixture,
    condition: { kind: "ready" },
    onAddTask: vi.fn(),
    onOpenTask: vi.fn(),
    onEditSchedule: vi.fn(),
    onSelectEvent: vi.fn(),
    onViewChange: vi.fn(),
    onVisibleRangeChange: vi.fn(),
    onEventMove: vi.fn().mockResolvedValue({ ok: true }),
    onEventResize: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
  return { ...render(<CalendarScreen {...props} />), props };
}

function setMobile(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: matches && query === "(max-width: 767px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}
