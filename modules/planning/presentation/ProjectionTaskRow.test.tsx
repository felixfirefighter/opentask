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

    await user.click(screen.getByRole("link", { name: /record the two-minute demo/i }));
    expect(onOpenTask).toHaveBeenCalledWith("task-demo");
    await user.click(screen.getByRole("button", { name: "Complete Record the two-minute demo" }));
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

    await user.click(screen.getByRole("button", { name: "More actions for Record the two-minute demo" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit schedule" }));
    expect(onEditSchedule).toHaveBeenCalledWith("task-demo");

    await user.click(screen.getByRole("button", { name: "More actions for Record the two-minute demo" }));
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
    expect(screen.getByRole("button", { name: /complete record/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /more actions/i })).toBeDisabled();
  });
});
