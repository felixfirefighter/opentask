import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { InboxSummary } from "../application/inbox";

import { InboxScreen } from "./InboxScreen";

const summary: InboxSummary = {
  id: "inbox_test_account",
  name: "Inbox",
  kind: "inbox",
  version: 1,
};

describe("InboxScreen", () => {
  it("renders the real Inbox summary as an honest WP01 empty surface", () => {
    render(<InboxScreen summary={summary} />);

    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toHaveAttribute("data-route-focus");
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("heading", { level: 2, name: "Inbox is empty" })).toBeVisible();
    expect(screen.getByText("Task capture is not available in this build yet.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps the heading visible and announces loading without flashing empty state", () => {
    render(<InboxScreen state="loading" />);

    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Loading Inbox");
    expect(screen.queryByText("Inbox is empty")).not.toBeInTheDocument();
  });

  it("offers a real retry callback when loading the Inbox fails", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<InboxScreen state="error" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Inbox could not be loaded");
    await user.click(screen.getByRole("button", { name: "Retry Inbox" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("uses the same permission-safe unavailable state without an action", () => {
    render(<InboxScreen state="unavailable" />);

    expect(screen.getByRole("heading", { level: 2, name: "Inbox unavailable" })).toBeVisible();
    expect(screen.getByText(/could not be found or you may not have access/i)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
