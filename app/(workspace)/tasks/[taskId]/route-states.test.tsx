import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import TaskDetailError from "./error";
import { TaskDetailRouteLoading } from "./TaskDetailRouteLoading";
import { readTaskDetailReturnHref } from "./task-detail-return";

describe("task-detail route states", () => {
  beforeEach(() => {
    navigation.search = "";
  });

  it("retains a validated planning origin while task details load", () => {
    navigation.search = `returnTo=${encodeURIComponent("/calendar?view=week&date=2026-07-20")}`;
    render(<TaskDetailRouteLoading />);

    expect(screen.getByRole("link", { name: "Back to task list" })).toHaveAttribute(
      "href",
      "/calendar?view=week&date=2026-07-20",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Opening task details…");
  });

  it("falls back to Inbox when a loading origin is external or unknown", () => {
    navigation.search = `returnTo=${encodeURIComponent("//attacker.example/steal")}`;
    render(<TaskDetailRouteLoading />);

    expect(screen.getByRole("link", { name: "Back to task list" })).toHaveAttribute("href", "/inbox");
  });

  it("offers retry and a safe close without exposing an initial-load failure", async () => {
    const reset = vi.fn();
    navigation.search = "returnTo=%2Ftoday";
    render(
      <TaskDetailError
        error={Object.assign(new Error("private task title and database detail"), {
          digest: "opaque-digest",
        })}
        reset={reset}
      />,
    );

    expect(screen.getByRole("heading", { name: "Task unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(/private task title/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to tasks" })).toHaveAttribute("href", "/today");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("accepts only released local task-list origins", () => {
    const listId = "00000000-0000-4000-8000-000000000020";
    expect(readTaskDetailReturnHref(`/lists/${listId}?section=mine#task`)).toBe(
      `/lists/${listId}?section=mine#task`,
    );
    expect(readTaskDetailReturnHref("/admin")).toBeNull();
    expect(readTaskDetailReturnHref("/\\attacker.example")).toBeNull();
  });
});
