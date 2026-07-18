import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PlanReviewScreen } from "./PlanReviewScreen";

describe("PlanReviewScreen", () => {
  it("updates the explicit apply count when an action is deselected", async () => {
    const user = userEvent.setup();
    render(<PlanReviewScreen />);

    expect(screen.getByRole("button", { name: "Apply 3 changes" })).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /record the two-minute demo/i }));

    expect(screen.getByRole("button", { name: "Apply 2 changes" })).toBeEnabled();
  });

  it("keeps overflow actions visible and non-selectable", () => {
    render(<PlanReviewScreen />);
    expect(screen.getByRole("checkbox", { name: /rewrite the full readme/i })).toBeDisabled();
    expect(screen.getByText(/only 45 minutes remain/i)).toBeVisible();
  });
});
