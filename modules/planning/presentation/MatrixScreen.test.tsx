import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { matrixFixture } from "./planning-screen-fixtures";
import type { MatrixPlanningModel } from "./planning-screen-model";
import { MatrixScreen, type MatrixScreenProps } from "./MatrixScreen";

function renderMatrix(overrides: Partial<MatrixScreenProps> = {}) {
  const props: MatrixScreenProps = {
    model: matrixFixture,
    condition: { kind: "ready" },
    taskActions: {},
    ...overrides,
  };
  return render(<MatrixScreen {...props} />);
}

describe("MatrixScreen", () => {
  it("renders the four named classification regions without drag affordances", () => {
    renderMatrix();
    expect(screen.getByRole("heading", { name: "Do now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Time-sensitive" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Later" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /drag|reorder/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Unscheduled tasks are not urgent/i)).toBeInTheDocument();
  });

  it("changes priority and schedule through keyboard-accessible row menus", async () => {
    const user = userEvent.setup();
    const onEditSchedule = vi.fn();
    const onPriorityChange = vi.fn();
    renderMatrix({ taskActions: { onEditSchedule, onPriorityChange } });

    await user.click(screen.getByRole("button", { name: "More actions for Confirm the workshop goals" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit schedule" }));
    expect(onEditSchedule).toHaveBeenCalledWith("task-story");

    await user.click(screen.getByRole("button", { name: "More actions for Confirm the workshop goals" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Low" }));
    expect(onPriorityChange).toHaveBeenCalledWith("task-story", "low");
  });

  it("uses one page-level state when every quadrant is empty", () => {
    renderMatrix({ model: emptyMatrix() });
    expect(screen.getByRole("heading", { name: "No open tasks to prioritize" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /jump to/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How tasks are placed" })).toBeInTheDocument();
  });

  it("preserves four-region geometry while loading", () => {
    renderMatrix({ condition: { kind: "loading" } });
    expect(screen.getByRole("heading", { name: "Do now" })).toBeInTheDocument();
    expect(screen.getByText("Loading Do now tasks")).toBeInTheDocument();
    expect(screen.getByText("Loading Later tasks")).toBeInTheDocument();
  });

  it("keeps its classifications visible and read-only while the local date refreshes", () => {
    renderMatrix({
      condition: { kind: "date-changed", currentDateLabel: "Tuesday, 21 July" },
      taskActions: { onPriorityChange: vi.fn() },
    });

    expect(screen.getByText("Confirm the workshop goals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more actions for confirm/i })).toBeDisabled();
  });

  it("keeps loaded quadrants read-only offline and hides them for permission", () => {
    const offline = renderMatrix({
      condition: { kind: "offline" },
      taskActions: { onEditSchedule: vi.fn() },
    });
    expect(screen.getByRole("button", { name: /more actions for confirm/i })).toBeDisabled();
    offline.unmount();

    renderMatrix({ condition: { kind: "permission" } });
    expect(screen.getByText("This planning view is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Confirm the workshop goals")).not.toBeInTheDocument();
  });

  it("keeps authoritative rows visible for error and conflict recovery", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const error = renderMatrix({ condition: { kind: "error" }, onRetry });
    expect(screen.getByText("Confirm the workshop goals")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    error.unmount();

    const emptyError = renderMatrix({ condition: { kind: "error" }, model: emptyMatrix() });
    expect(screen.getByText("Priority classifications are unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No open tasks to prioritize")).not.toBeInTheDocument();
    emptyError.unmount();

    renderMatrix({
      condition: { kind: "conflict" },
      model: {
        ...matrixFixture,
        quadrants: {
          ...matrixFixture.quadrants,
          doNow: {
            ...matrixFixture.quadrants.doNow,
            tasks: [{ ...matrixFixture.quadrants.doNow.tasks[0]!, conflicted: true }],
          },
        },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("A task changed elsewhere");
    expect(screen.getByText("Changed elsewhere")).toBeInTheDocument();
  });
});

function emptyMatrix(): MatrixPlanningModel {
  return {
    ...matrixFixture,
    quadrants: {
      doNow: { ...matrixFixture.quadrants.doNow, tasks: [] },
      plan: { ...matrixFixture.quadrants.plan, tasks: [] },
      timeSensitive: { ...matrixFixture.quadrants.timeSensitive, tasks: [] },
      later: { ...matrixFixture.quadrants.later, tasks: [] },
    },
  };
}
