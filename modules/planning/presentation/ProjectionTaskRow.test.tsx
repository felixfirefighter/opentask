import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { planningTaskFixture } from "./planning-screen-fixtures";
import { ProjectionTaskRow } from "./ProjectionTaskRow";

describe("ProjectionTaskRow", () => {
  it("keeps opening and completion as separate accessible actions", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const onStatusChange = vi.fn();
    render(<ProjectionTaskRow task={planningTaskFixture()} actions={{ onOpenTask, onStatusChange }} />);

    await user.click(screen.getByRole("link", { name: /outline the workshop agenda/i }));
    expect(onOpenTask).toHaveBeenCalledWith("task-demo");
    await user.click(screen.getByRole("button", { name: "Complete Outline the workshop agenda" }));
    expect(onStatusChange).toHaveBeenCalledWith("task-demo", "completed");
  });

  it("offers schedule, priority, and lifecycle changes through the labeled menu", async () => {
    const user = userEvent.setup();
    const onEditSchedule = vi.fn();
    const onPriorityChange = vi.fn();
    const onStatusChange = vi.fn();
    render(
      <ProjectionTaskRow
        task={planningTaskFixture()}
        actions={{ onEditSchedule, onPriorityChange, onStatusChange }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions for Outline the workshop agenda" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit schedule" }));
    expect(onEditSchedule).toHaveBeenCalledWith("task-demo");

    await user.click(screen.getByRole("button", { name: "More actions for Outline the workshop agenda" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Low" }));
    expect(onPriorityChange).toHaveBeenCalledWith("task-demo", "low");
  });

  it("names conflict and read-only state without relying on color", () => {
    render(
      <ProjectionTaskRow
        disabled
        task={planningTaskFixture({ conflicted: true })}
        actions={{ onEditSchedule: vi.fn(), onStatusChange: vi.fn() }}
      />,
    );

    expect(screen.getByText("Changed elsewhere")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /complete outline/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /more actions/i })).toBeDisabled();
  });

  it("uses occurrence commands for recurring Complete and Skip without changing series status", async () => {
    const user = userEvent.setup();
    const onOccurrenceTransition = vi.fn();
    const onStatusChange = vi.fn();
    const onEditSeriesSchedule = vi.fn();
    const task = recurringTask("open");
    render(
      <ProjectionTaskRow
        task={task}
        actions={{ onEditSeriesSchedule, onOccurrenceTransition, onStatusChange }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Complete occurrence of Outline the workshop agenda" }),
    );
    expect(onOccurrenceTransition).toHaveBeenCalledWith(
      task.taskId,
      task.occurrenceKey,
      "complete",
      task.projectionId,
    );
    expect(onStatusChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("menuitem", { name: "Skip occurrence" }));
    expect(onOccurrenceTransition).toHaveBeenCalledWith(
      task.taskId,
      task.occurrenceKey,
      "skip",
      task.projectionId,
    );

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("menuitem", { name: "Edit future series schedule" }));
    expect(onEditSeriesSchedule).toHaveBeenCalledWith(task.taskId);
  });

  it.each(["completed", "skipped"] as const)("offers Undo for a terminal %s occurrence", async (state) => {
    const user = userEvent.setup();
    const onOccurrenceTransition = vi.fn();
    const task = recurringTask(state);
    render(<ProjectionTaskRow task={task} actions={{ onOccurrenceTransition }} />);

    await user.click(
      screen.getByRole("button", {
        name: `Undo ${state} occurrence of Outline the workshop agenda`,
      }),
    );
    expect(onOccurrenceTransition).toHaveBeenCalledWith(
      task.taskId,
      task.occurrenceKey,
      "undo",
      task.projectionId,
    );
    expect(screen.getByText(new RegExp(state, "i"))).toBeInTheDocument();
  });

  it("keeps recurring occurrence mutations disabled in a read-only projection", () => {
    render(
      <ProjectionTaskRow
        disabled
        disabledReason="Writes are unavailable while offline."
        task={recurringTask("open")}
        actions={{ onOccurrenceTransition: vi.fn(), onEditSeriesSchedule: vi.fn() }}
      />,
    );

    expect(screen.getByRole("button", { name: /complete occurrence/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /more actions/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /complete occurrence/i })).toHaveAttribute(
      "title",
      "Writes are unavailable while offline.",
    );
  });

  it("opens task details instead of completing a recurrence-summary row", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const onStatusChange = vi.fn();
    const task = planningTaskFixture({
      projectionId: "series:task-demo",
      projectionLifecycle: "recurrence_summary",
      occurrenceKey: null,
      occurrenceState: null,
      recurrenceSummary: "No occurrence in the next 62 days",
      scheduleInteraction: {
        editScope: "series",
        dragEnabled: false,
        dragDisabledReason:
          "Per-occurrence rescheduling is not available. Edit the future series schedule instead.",
      },
      contextLabel: "No occurrence in the next 62 days",
    });
    render(<ProjectionTaskRow task={task} actions={{ onOpenTask, onStatusChange }} />);

    await user.click(
      screen.getByRole("button", {
        name: "Open recurring task details for Outline the workshop agenda",
      }),
    );
    expect(onOpenTask).toHaveBeenCalledWith(task.taskId);
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

function recurringTask(occurrenceState: "open" | "completed" | "skipped") {
  return planningTaskFixture({
    projectionId: `occurrence:task-demo:occurrence-${occurrenceState}`,
    projectionLifecycle: "recurring_occurrence",
    occurrenceKey: `occurrence-${occurrenceState}`,
    occurrenceState,
    recurrenceSummary: null,
    scheduleInteraction: {
      editScope: "series",
      dragEnabled: false,
      dragDisabledReason:
        "Per-occurrence rescheduling is not available. Edit the future series schedule instead.",
    },
    contextLabel: `Recurring occurrence · ${occurrenceState}`,
  });
}
