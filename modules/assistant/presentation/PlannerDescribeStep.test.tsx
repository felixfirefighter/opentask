import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { plannerInputFixture, taskIds } from "./planner-presentation-fixtures";
import { renderPlanner } from "./planner-presentation-test-support";

describe("Assistant planner Describe and Processing", () => {
  it("collects explicit input and selected task context before creating a proposal", async () => {
    const user = userEvent.setup();
    const onCreateProposal = vi.fn();
    renderPlanner({
      initialInput: { ...plannerInputFixture, brainDump: "", selectedTaskIds: [] },
      onCreateProposal,
    });

    const create = screen.getByRole("button", { name: "Create proposal" });
    expect(create).toBeDisabled();
    expect(screen.getByText("Add a brain dump or select at least one task.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /review workshop checklist/i }));
    expect(
      screen.getByText("Choose only the tasks the planner may inspect. 1 selected."),
    ).toBeInTheDocument();
    expect(create).toBeEnabled();
    await user.click(create);

    expect(onCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ brainDump: "", selectedTaskIds: [taskIds.review] }),
    );
  });

  it("searches the labeled checklist without changing the selection", async () => {
    const user = userEvent.setup();
    renderPlanner();
    const search = screen.getByRole("searchbox", { name: "Search tasks" });
    await user.type(search, "attendee");
    expect(screen.getByText("Prepare attendee notes")).toBeInTheDocument();
    expect(screen.queryByText("Review workshop checklist")).not.toBeInTheDocument();
    expect(
      screen.getByText("Choose only the tasks the planner may inspect. 2 selected."),
    ).toBeInTheDocument();
  });

  it("validates the work window and moves focus to a recoverable error summary", async () => {
    const user = userEvent.setup();
    renderPlanner({
      initialInput: {
        ...plannerInputFixture,
        workWindow: { start: "17:00", end: "09:00" },
      },
    });
    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The work window must end after it starts.");
    expect(alert).toHaveFocus();
  });

  it("shows only honest processing stages and submitted constraints", () => {
    renderPlanner({
      state: { kind: "processing", stage: "validating", submittedInput: plannerInputFixture },
    });
    const panel = screen.getByRole("region", { name: "Building a reviewable plan" });
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(panel).toHaveTextContent("Interpreting the selected inputcomplete");
    expect(panel).toHaveTextContent("Validating suggestions and constraintscurrent");
    expect(panel).toHaveTextContent("Asia/Singapore");
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("explains the data boundary and never presents an API-key field", () => {
    renderPlanner();
    expect(screen.getByText(/Only this input and selected task context are sent/i)).toBeInTheDocument();
    expect(screen.getByText(/raw brain dump is not stored/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Interpreted window:/).closest("p")).toHaveTextContent(
      "Mon, Jul 20, 2026 · 9:00 AM–5:00 PM · 10 min buffer · Asia/Singapore",
    );
    const inputCard = screen
      .getByRole("heading", { name: "Describe what needs attention" })
      .closest("section");
    expect(within(inputCard!).getByRole("textbox", { name: /Brain dump/i })).toBeInTheDocument();
  });
});
