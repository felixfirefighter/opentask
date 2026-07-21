import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlanningQuickAdd } from "./PlanningQuickAdd";

describe("PlanningQuickAdd", () => {
  it("uses Escape to remove the visible schedule before clearing source text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRemoveToken = vi.fn();
    const view = render(
      <PlanningQuickAdd
        model={{
          value: "Keep source tomorrow",
          submitting: false,
          destinationLabel: "Today",
          tokens: [{ id: "recognized", label: "tomorrow" }],
        }}
        onChange={onChange}
        onSubmit={vi.fn()}
        onRemoveToken={onRemoveToken}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Add a task" });

    await user.click(input);
    await user.keyboard("{Escape}");
    expect(onRemoveToken).toHaveBeenCalledWith("recognized");
    expect(onChange).not.toHaveBeenCalled();

    view.rerender(
      <PlanningQuickAdd
        model={{
          value: "Keep source tomorrow",
          submitting: false,
          destinationLabel: "Today",
          tokens: [],
        }}
        onChange={onChange}
        onSubmit={vi.fn()}
        onRemoveToken={onRemoveToken}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onChange).toHaveBeenCalledWith("");
  });
});
