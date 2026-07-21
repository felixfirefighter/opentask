import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceLoadingShell } from "./WorkspaceLoadingShell";

describe("WorkspaceLoadingShell", () => {
  it("preserves workspace landmarks while a route loads", () => {
    render(<WorkspaceLoadingShell />);

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Workspace navigation loading" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Opening your workspace…");
    expect(screen.getByRole("status")).toHaveTextContent("Opening your workspace…");
  });

  it("keeps a usable back action in the task-detail loading state", () => {
    render(<WorkspaceLoadingShell detail label="Opening task details…" returnHref="/calendar?view=week" />);

    expect(screen.getByRole("link", { name: "Back to task list" })).toHaveAttribute(
      "href",
      "/calendar?view=week",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Opening task details…");
    expect(screen.getByRole("status")).toHaveTextContent("Opening task details…");
    expect(document.querySelector('[data-loading-shape="task-detail"]')).toBeInTheDocument();
  });

  it("accepts feature-owned loading content without changing the legacy shell landmarks", () => {
    render(
      <WorkspaceLoadingShell label="Loading habits">
        <section aria-label="Habit loading content">
          <h1>Habits</h1>
        </section>
      </WorkspaceLoadingShell>,
    );

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Workspace navigation loading" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { name: "Habits" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading habits");
    expect(screen.queryByLabelText("Workspace content loading")).not.toBeInTheDocument();
  });
});
