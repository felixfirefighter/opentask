import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { plannerInputFixture } from "./planner-presentation-fixtures";
import { renderPlanner } from "./planner-presentation-test-support";

describe("Assistant planner conditions", () => {
  it("shows a calm no-key state with manual planning alternatives", () => {
    renderPlanner({ capability: { state: "disabled", reason: "missing_api_key" } });
    expect(
      screen.getByRole("heading", { name: "Planning is unavailable because no AI key is configured" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Today" })).toHaveAttribute("href", "/today");
    expect(screen.getByRole("link", { name: "Open Calendar" })).toHaveAttribute("href", "/calendar");
    expect(screen.queryByRole("button", { name: "Create proposal" })).not.toBeInTheDocument();
  });

  it("keeps loaded input visible but disables creation offline", () => {
    renderPlanner({ online: false });
    expect(screen.getByRole("status")).toHaveTextContent("Planner actions are unavailable offline");
    expect(screen.getByRole("textbox", { name: /Brain dump/i })).toHaveValue(plannerInputFixture.brainDump);
    expect(screen.getByRole("button", { name: "Create proposal" })).toBeDisabled();
    expect(screen.getByText("Reconnect to create a proposal.")).toBeInTheDocument();
  });

  it("uses specific recoverable copy and confirms no changes for generation failures", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderPlanner({ state: { kind: "describe", failure: { kind: "timeout" } }, onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("The planner took too long");
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing was changed");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each([
    ["refusal", "No proposal was returned"],
    ["invalid_schema", "The response could not be validated"],
    ["provider", "Planning is temporarily unavailable"],
    ["constraint", "The plan could not fit the constraints"],
  ] as const)("names the %s failure", (kind, title) => {
    renderPlanner({ state: { kind: "describe", failure: { kind } } });
    expect(screen.getByRole("alert")).toHaveTextContent(title);
  });

  it("does not expose task or proposal content in the permission state", () => {
    renderPlanner({ state: { kind: "permission" } });
    expect(
      screen.getByRole("heading", { name: "This planning proposal is unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Review launch checklist")).not.toBeInTheDocument();
    expect(screen.queryByText(plannerInputFixture.brainDump)).not.toBeInTheDocument();
  });
});
