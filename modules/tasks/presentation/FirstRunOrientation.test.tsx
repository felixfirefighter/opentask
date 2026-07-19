import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { FirstRunOrientation } from "./FirstRunOrientation";

describe("FirstRunOrientation", () => {
  beforeEach(() => window.localStorage.clear());

  it("points to quick add, Today, and command search without blocking the Inbox", async () => {
    render(<FirstRunOrientation />);

    expect(
      await screen.findByRole("complementary", { name: "Three quick ways into your day" }),
    ).toBeVisible();
    expect(screen.getByText("Quick add", { exact: true })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Today" })).toHaveAttribute("href", "/today");
    expect(screen.getByText("Ctrl/⌘ K")).toBeVisible();
  });

  it("dismisses locally and announces the result", async () => {
    const user = userEvent.setup();
    render(<FirstRunOrientation />);

    await user.click(await screen.findByRole("button", { name: "Dismiss getting started tips" }));
    expect(
      screen.queryByRole("complementary", { name: "Three quick ways into your day" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Getting started tips dismissed");
  });
});
