import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { todayFixture } from "./planning-screen-fixtures";
import { renderToday } from "./planning-screen-test-support";

describe("TodayScreen", () => {
  it("renders overdue, timed, and anytime work in the committed order", () => {
    renderToday();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Overdue", "Timed", "Anytime"]);
    expect(screen.getByText("4 tasks remaining")).toBeInTheDocument();
  });

  it("keeps source text while recognized values are edited or cleared", async () => {
    const user = userEvent.setup();
    const onEditQuickAddToken = vi.fn();
    const onRemoveQuickAddToken = vi.fn();
    const onQuickAddSubmit = vi.fn();
    renderToday({ onEditQuickAddToken, onRemoveQuickAddToken, onQuickAddSubmit });

    const input = screen.getByRole("textbox", { name: "Add a task" });
    expect(input).toHaveValue("Call Sam tomorrow at 3pm");
    await user.click(screen.getByRole("button", { name: "Edit recognized value Tomorrow, 3:00 PM" }));
    await user.click(screen.getByRole("button", { name: "Clear recognized value Tomorrow, 3:00 PM" }));
    expect(input).toHaveValue("Call Sam tomorrow at 3pm");
    expect(onEditQuickAddToken).toHaveBeenCalledWith("when");
    expect(onRemoveQuickAddToken).toHaveBeenCalledWith("when");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(onQuickAddSubmit).toHaveBeenCalledWith("Call Sam tomorrow at 3pm");
  });

  it("shows the destination empty state without celebration or shame copy", () => {
    renderToday({
      model: { ...todayFixture, remainingLabel: "0 tasks remaining", overdue: [], timed: [], anytime: [] },
    });
    expect(screen.getByRole("heading", { name: "Nothing planned for today" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Upcoming" })).toHaveAttribute("href", "/upcoming");
  });
});
