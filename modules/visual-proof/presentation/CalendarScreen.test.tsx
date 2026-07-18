import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CalendarScreen } from "./CalendarScreen";

describe("CalendarScreen", () => {
  it("switches between the committed calendar projections", async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);

    await user.click(screen.getByRole("button", { name: "Week" }));

    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Week time grid" })).toBeVisible();
  });
});
