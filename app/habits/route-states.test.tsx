import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/identity/presentation", () => ({
  WorkspaceLoadingShell: ({ children, label }: { children: ReactNode; label: string }) => (
    <main aria-busy="true">
      {children}
      <span role="status">{label}</span>
    </main>
  ),
  WorkspaceRouteError: ({
    onRetry,
    returnHref,
    returnLabel,
    title,
  }: {
    onRetry: () => void;
    returnHref: string;
    returnLabel: string;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
      <a href={returnHref}>{returnLabel}</a>
    </div>
  ),
}));

import HabitError from "./error";
import HabitLoading from "./loading";

describe("habit route states", () => {
  it("preserves the habit header, view controls, and summary-shaped loading rows", () => {
    render(<HabitLoading />);

    expect(screen.getByRole("heading", { name: "Habits", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading habits");
    expect(screen.getByRole("navigation", { name: "Habit view" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute("href", "/habits");
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("href", "/habits?view=archived");
    expect(screen.getByRole("button", { name: "Create habit" })).toBeDisabled();
    expect(document.querySelectorAll('[data-loading-shape="habit-summary"]')).toHaveLength(3);
  });

  it("offers a scoped retry and safe Inbox exit", async () => {
    const reset = vi.fn();
    render(<HabitError error={new Error("private habit detail")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Habits unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(/private habit detail/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Inbox" })).toHaveAttribute("href", "/inbox");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
