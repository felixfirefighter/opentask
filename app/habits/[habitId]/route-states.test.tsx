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

import HabitDetailError from "./error";
import HabitDetailLoading from "./loading";

describe("habit-detail route states", () => {
  it("renders a habit-shaped shell with independently named history loading", () => {
    render(<HabitDetailLoading />);

    expect(screen.getByRole("heading", { name: "Habit details", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Loading habit details").closest('[role="status"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to habits" })).toHaveAttribute("href", "/habits");
    expect(screen.getByRole("heading", { name: "Current practice" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Last seven days" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monthly history" })).toBeInTheDocument();
    expect(screen.getByText("Loading habit history").closest('[role="status"]')).toBeInTheDocument();
    expect(document.querySelector('[data-loading-shape="habit-detail"]')).toBeInTheDocument();
    expect(screen.queryByText(/task/i)).not.toBeInTheDocument();
  });

  it("offers a retry and permission-safe return to habits", async () => {
    const reset = vi.fn();
    render(<HabitDetailError error={new Error("private habit title")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Habit unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(/private habit title/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to habits" })).toHaveAttribute("href", "/habits");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
