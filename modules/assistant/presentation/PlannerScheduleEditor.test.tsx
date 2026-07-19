import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PlannerSchedule } from "../application/contracts";
import { PlannerScheduleEditor } from "./PlannerScheduleEditor";

const context = {
  planningDate: "2026-03-08",
  timeZone: "America/New_York",
  workWindowStart: "03:30",
  defaultDurationMinutes: 30,
};

const timedSchedule: PlannerSchedule = {
  kind: "timed",
  startAt: "2026-03-08T07:30:00Z",
  endAt: "2026-03-08T08:00:00Z",
  timeZone: "America/New_York",
};

describe("PlannerScheduleEditor", () => {
  it("converts a valid local edit and keeps the proposal timezone", () => {
    const onChange = vi.fn();
    renderEditor({ schedule: timedSchedule, onChange });

    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "2026-03-08T04:15" },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...timedSchedule,
      startAt: "2026-03-08T08:15:00Z",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["2026-03-08T02:30", "2026-11-01T01:30"])(
    "rejects the skipped or repeated edit %s with an associated accessible error",
    (value) => {
      const onChange = vi.fn();
      renderEditor({ schedule: timedSchedule, onChange });

      fireEvent.change(screen.getByLabelText("Starts"), { target: { value } });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Schedule not changed");
      expect(alert).toHaveTextContent("daylight-saving changes can skip or repeat times");
      expect(screen.getByLabelText("Starts")).toHaveAttribute(
        "aria-describedby",
        expect.stringContaining(alert.id),
      );
      expect(screen.getByLabelText("Starts")).toHaveValue("2026-03-08T03:30");
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid default block without crashing or changing the prior mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({
      schedule: null,
      context: { ...context, workWindowStart: "02:30" },
      allowNone: true,
      onChange,
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Schedule type" }), "timed");

    expect(screen.getByRole("alert")).toHaveTextContent("default start time does not occur once");
    expect(screen.getByRole("combobox", { name: "Schedule type" })).toHaveValue("none");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers only timed or optional unscheduled review choices", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({ schedule: null, allowNone: true, onChange });

    expect(screen.getByRole("option", { name: "Timed" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Not scheduled" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "All day" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/all-day scheduling remains available in the manual task editor/i),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Schedule type" }), "timed");
    expect(onChange).toHaveBeenCalledWith(timedSchedule);
  });

  it("lets an unsupported all-day create action recover to no schedule", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({
      schedule: { kind: "all_day", startDate: "2026-03-08", endDate: "2026-03-09" },
      allowNone: true,
      onChange,
    });

    expect(screen.queryByRole("textbox", { name: /Starts on/i })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("All-day schedules cannot be applied");
    expect(screen.queryByRole("option", { name: "All day" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Schedule type" }), "none");
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

function renderEditor({
  schedule,
  context: scheduleContext = context,
  allowNone = false,
  onChange,
}: Readonly<{
  schedule: PlannerSchedule | null;
  context?: typeof context;
  allowNone?: boolean;
  onChange: (schedule: PlannerSchedule | null) => void;
}>) {
  return render(
    <PlannerScheduleEditor
      schedule={schedule}
      context={scheduleContext}
      allowNone={allowNone}
      disabled={false}
      onChange={onChange}
    />,
  );
}
