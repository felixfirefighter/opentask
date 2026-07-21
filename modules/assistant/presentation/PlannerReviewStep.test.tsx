import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { confirmUnsavedNavigation } from "@/shared/presentation";

import { plannerProposalDtoSchema } from "../application/contracts";
import { actionIds, emptyProposalFixture, plannerProposalFixture } from "./planner-presentation-fixtures";
import { renderPlanner } from "./planner-presentation-test-support";

function renderReview(overrides: Parameters<typeof renderPlanner>[0] = {}) {
  return renderPlanner({
    state: { kind: "review", proposal: plannerProposalFixture },
    ...overrides,
  });
}

describe("Assistant planner Review", () => {
  it("groups the complete diff and exposes rationale, uncertainty, and overflow", () => {
    renderReview();
    expect(screen.getByRole("heading", { name: "Proposal changes" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scheduled and updated" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deferred and overflow" })).toBeInTheDocument();
    expect(
      screen.getByText("Confirm whether the volunteer coordinator needs a second account."),
    ).toBeInTheDocument();
    expect(screen.getByText("No free interval was available inside the work window.")).toBeInTheDocument();
    expect(screen.getAllByText("Why this change:")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Apply 5 changes" })).toBeEnabled();
  });

  it("deselects every action type, including a visible defer action", async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(
      screen.getByRole("checkbox", { name: "Select defer action for Clarify partner handoff" }),
    );
    expect(screen.getByRole("button", { name: "Apply 4 changes" })).toBeInTheDocument();
  });

  it("edits only the fields allowed by the action kind and applies the edited selection", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderReview({ onApply });

    const priorityCard = screen.getByText("Prioritize", { selector: "span" }).closest("article")!;
    await user.click(within(priorityCard).getByRole("button", { name: "Edit change" }));
    expect(
      within(priorityCard).queryByRole("textbox", { name: /Title after apply/i }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      within(priorityCard).getByRole("combobox", { name: "Priority after apply" }),
      "low",
    );

    const scheduleCard = screen.getByText("Schedule", { selector: "span" }).closest("article")!;
    await user.click(within(scheduleCard).getByRole("button", { name: "Edit change" }));
    expect(within(scheduleCard).getByRole("combobox", { name: "Schedule type" })).toBeInTheDocument();
    expect(
      within(scheduleCard).queryByRole("textbox", { name: /Title after apply/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply 5 changes" }));
    expect(onApply).toHaveBeenCalledOnce();
    const selection = onApply.mock.calls[0]![0];
    expect(selection.proposalId).toBe(plannerProposalFixture.id);
    expect(selection.applyToken).toBe(plannerProposalFixture.applyToken);
    expect(
      selection.actions.find(({ actionId }: { actionId: string }) => actionId === actionIds.prioritize),
    ).toMatchObject({ after: "low" });
  });

  it("keeps invalid local edits visible and removes them from the applicable count", async () => {
    const user = userEvent.setup();
    renderReview();
    const createCard = screen.getByText("Create", { selector: "span" }).closest("article")!;
    await user.click(within(createCard).getByRole("button", { name: "Edit change" }));
    await user.clear(within(createCard).getByRole("textbox", { name: "Title after apply" }));

    const movedCard = screen.getByText("Invalid edit").closest("article")!;
    expect(within(movedCard).getByRole("checkbox", { name: /Select create action/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply 4 changes" })).toBeInTheDocument();
  });

  it("blocks only a stale affected action and shows the latest safe value", () => {
    renderPlanner({
      state: {
        kind: "review",
        proposal: plannerProposalFixture,
        issues: [
          {
            actionId: actionIds.schedule,
            kind: "stale",
            message: "This task changed elsewhere. Review the latest version.",
            latestBefore: "Tomorrow at 10:00 AM",
          },
        ],
      },
    });
    const scheduleSelection = screen.getByRole("checkbox", {
      name: "Select schedule action for Review workshop checklist",
    });
    expect(scheduleSelection).toBeDisabled();
    expect(screen.getByText("Tomorrow at 10:00 AM")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Select prioritize action/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Apply 4 changes" })).toBeInTheDocument();
  });

  it("keeps a loaded proposal readable but disables every review mutation offline", () => {
    renderReview({ online: false });
    expect(screen.getByRole("status")).toHaveTextContent("Planner actions are unavailable offline");
    expect(screen.getAllByText("Draft workshop notes").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Apply 5 changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject proposal" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Select create action/i })).toBeDisabled();
  });

  it("blocks the complete selection when the proposal is globally stale", () => {
    renderPlanner({
      state: {
        kind: "review",
        proposal: plannerProposalFixture,
        failure: { kind: "stale" },
      },
    });
    expect(screen.getByRole("button", { name: "Apply 0 changes" })).toBeDisabled();
    expect(screen.getAllByText("Changed elsewhere")).toHaveLength(5);
  });

  it("shows deterministic conflicts as blocked without hiding the overflow item", () => {
    const proposal = plannerProposalDtoSchema.parse({
      ...plannerProposalFixture,
      proposal: {
        ...plannerProposalFixture.proposal,
        conflicts: [{ semanticRef: "new-2", code: "IMPOSSIBLE_CONSTRAINTS" }],
      },
    });
    renderPlanner({ state: { kind: "review", proposal } });
    const defer = screen.getByRole("checkbox", {
      name: "Select defer action for Clarify partner handoff",
    });
    expect(defer).toBeDisabled();
    expect(screen.getByText("The requested constraints cannot all be satisfied.")).toBeInTheDocument();
    expect(screen.getByText("No free interval was available inside the work window.")).toBeInTheDocument();
  });

  it("requires confirmation before local review edits are discarded", async () => {
    const user = userEvent.setup();
    const onEditInput = vi.fn();
    renderReview({ onEditInput });
    await user.click(
      screen.getByRole("checkbox", { name: "Select defer action for Clarify partner handoff" }),
    );
    await user.click(screen.getByRole("button", { name: "Edit input" }));
    expect(screen.getByRole("alertdialog", { name: "Discard review edits?" })).toBeInTheDocument();
    expect(onEditInput).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard review edits" }));
    expect(onEditInput).toHaveBeenCalledOnce();
  });

  it("protects dirty review edits from reload and task-link navigation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderReview();
    await user.click(
      screen.getByRole("checkbox", { name: "Select defer action for Clarify partner handoff" }),
    );

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getAllByRole("link", { name: "Review workshop checklist" })[0]!);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Discard review edits?"));

    expect(confirmUnsavedNavigation()).toBe(false);
    confirm.mockReturnValue(true);
    act(() => expect(confirmUnsavedNavigation()).toBe(true));
    expect(
      screen.getByRole("checkbox", { name: "Select defer action for Clarify partner handoff" }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Apply 5 changes" })).toBeEnabled();
  });

  it("does not guard navigation after local selection changes are fully reverted", async () => {
    const user = userEvent.setup();
    renderReview();
    const selection = screen.getByRole("checkbox", {
      name: "Select defer action for Clarify partner handoff",
    });
    await user.click(selection);
    await user.click(selection);

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(false);
  });

  it("keeps explicit reject and apply operations stable against duplicate actions", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    renderReview({ onReject });
    await user.click(screen.getByRole("button", { name: "Reject proposal" }));
    expect(onReject).toHaveBeenCalledWith(plannerProposalFixture.id);
  });

  it("blocks duplicate apply and reject requests while an atomic apply is in progress", () => {
    renderPlanner({
      state: {
        kind: "review",
        proposal: plannerProposalFixture,
        operation: "applying",
      },
    });
    expect(screen.getByRole("button", { name: "Applying 5 changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject proposal" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revalidate" })).toBeDisabled();
  });

  it("shows an honest zero-action proposal instead of an error", () => {
    renderPlanner({ state: { kind: "review", proposal: emptyProposalFixture() } });
    expect(screen.getByRole("heading", { name: "No changes were proposed" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: /Apply \d/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit input" })).toHaveLength(2);
  });

  it("preserves edits after an atomic apply failure and says the selection rolled back", () => {
    renderPlanner({
      state: {
        kind: "review",
        proposal: plannerProposalFixture,
        failure: { kind: "apply" },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("No changes were applied");
    expect(screen.getByRole("alert")).toHaveTextContent("complete selection was rolled back");
    expect(screen.getByRole("button", { name: "Apply 5 changes" })).toBeEnabled();
  });
});
