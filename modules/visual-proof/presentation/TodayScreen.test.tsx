import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TodayScreen } from "./TodayScreen";

describe("TodayScreen", () => {
  it("allows a fixture task to be completed and restored", async () => {
    const user = userEvent.setup();
    render(<TodayScreen />);

    const complete = screen.getByRole("button", { name: "Complete Record the two-minute demo" });
    await user.click(complete);

    expect(
      screen.getByRole("button", { name: "Mark Record the two-minute demo incomplete" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
