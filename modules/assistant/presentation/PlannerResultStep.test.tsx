import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { plannerProposalFixture, proposalWithStatus } from "./planner-presentation-fixtures";
import { renderPlanner } from "./planner-presentation-test-support";

describe("Assistant planner Result and terminal proposal states", () => {
  it("announces the exact atomic result and preserves not-applied counts", () => {
    renderPlanner({
      state: {
        kind: "result",
        proposal: proposalWithStatus("applied"),
        result: {
          proposalId: plannerProposalFixture.id,
          outcome: "applied",
          appliedActionCount: 3,
        },
        selectedActionCount: 3,
        notAppliedActionCount: 2,
        taskLinks: [],
      },
    });
    expect(screen.getByRole("heading", { name: "Your selected changes were applied" })).toHaveFocus();
    expect(screen.getByText("3 actions were committed together.")).toBeInTheDocument();
    expect(screen.getByText(/Deselected, invalid, or deferred items remain/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Today" })).toHaveAttribute("href", "/today");
    expect(screen.getByRole("link", { name: "Open Calendar" })).toHaveAttribute("href", "/calendar");
  });

  it("names an idempotent retry and confirms that no duplicate changes were made", () => {
    renderPlanner({
      state: {
        kind: "result",
        proposal: proposalWithStatus("applied"),
        result: {
          proposalId: plannerProposalFixture.id,
          outcome: "already_applied",
          appliedActionCount: 0,
        },
        selectedActionCount: 5,
        notAppliedActionCount: 0,
        taskLinks: [],
      },
    });
    expect(screen.getByRole("heading", { name: "This proposal was already applied" })).toBeInTheDocument();
    expect(screen.getByText(/idempotency check prevented duplicate changes/i)).toBeInTheDocument();
    expect(screen.getByText("Duplicated").nextElementSibling).toHaveTextContent("0");
  });

  it.each([
    ["applied", "This proposal was already applied", "No duplicate task changes"],
    ["rejected", "This proposal was rejected", "No task changes were applied"],
    ["expired", "This proposal expired", "current tasks and schedules"],
  ] as const)("renders the %s persisted lifecycle", (status, title, message) => {
    renderPlanner({ state: { kind: "review", proposal: proposalWithStatus(status) } });
    expect(screen.getByRole("heading", { name: title })).toHaveFocus();
    expect(screen.getByText(new RegExp(message, "i"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply \d/ })).not.toBeInTheDocument();
  });

  it("lets the user start another explicit proposal after a result", async () => {
    const user = userEvent.setup();
    const onEditInput = vi.fn();
    renderPlanner({
      onEditInput,
      state: {
        kind: "result",
        proposal: proposalWithStatus("applied"),
        result: {
          proposalId: plannerProposalFixture.id,
          outcome: "applied",
          appliedActionCount: 5,
        },
        selectedActionCount: 5,
        notAppliedActionCount: 0,
        taskLinks: [],
      },
    });
    await user.click(screen.getByRole("button", { name: "Create another proposal" }));
    expect(onEditInput).toHaveBeenCalledOnce();
  });
});
