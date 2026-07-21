import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceRouteError } from "./WorkspaceRouteError";

describe("WorkspaceRouteError", () => {
  it("keeps private error details hidden and offers a retry", async () => {
    const onRetry = vi.fn();
    render(
      <WorkspaceRouteError
        error={Object.assign(new Error("private database detail"), { digest: "opaque-digest" })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Your data was not changed");
    expect(screen.queryByText(/private database detail/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("can add a task-specific safe exit without changing the generic error disclosure", () => {
    render(
      <WorkspaceRouteError
        error={new Error("private detail")}
        eyebrow="Tasks"
        title="Task unavailable"
        message="Task details could not be loaded. Your data was not changed."
        onRetry={vi.fn()}
        returnHref="/today"
        returnLabel="Back to tasks"
      />,
    );

    expect(screen.getByRole("heading", { name: "Task unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to tasks" })).toHaveAttribute("href", "/today");
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});
