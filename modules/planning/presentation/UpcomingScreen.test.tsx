import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { upcomingFixture } from "./planning-screen-fixtures";
import { UpcomingScreen, type UpcomingScreenProps } from "./UpcomingScreen";

function renderUpcoming(overrides: Partial<UpcomingScreenProps> = {}) {
  const props: UpcomingScreenProps = {
    model: upcomingFixture,
    condition: { kind: "ready" },
    taskActions: {},
    onAddTask: vi.fn(),
    ...overrides,
  };
  return { ...render(<UpcomingScreen {...props} />), props };
}

describe("UpcomingScreen", () => {
  it("groups the same task rows by local date", () => {
    renderUpcoming();
    expect(screen.getByRole("heading", { name: "Monday, 20 July" })).toBeInTheDocument();
    expect(screen.getByText("Outline the workshop agenda")).toBeInTheDocument();
    expect(screen.getByLabelText("4 tasks in the next 7 days")).toBeInTheDocument();
  });

  it("uses the exact empty destination and a working add action", async () => {
    const user = userEvent.setup();
    const onAddTask = vi.fn();
    renderUpcoming({ model: { ...upcomingFixture, groups: [], totalLabel: "0 tasks" }, onAddTask });
    expect(screen.getByRole("heading", { name: "Nothing in the next 7 days" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Add a task" })[0]!);
    expect(onAddTask).toHaveBeenCalledOnce();
  });

  it("hides private rows when permission is unavailable", () => {
    renderUpcoming({ condition: { kind: "permission" } });
    expect(screen.getByText("This planning view is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Outline the workshop agenda")).not.toBeInTheDocument();
  });

  it("covers loading, error, offline, and conflict recovery states", async () => {
    const user = userEvent.setup();
    const loading = renderUpcoming({ condition: { kind: "loading" } });
    expect(screen.getByText("Loading upcoming tasks")).toBeInTheDocument();
    loading.unmount();

    const onRetry = vi.fn();
    const error = renderUpcoming({ condition: { kind: "error" }, onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("Planning could not be refreshed");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    error.unmount();

    const emptyError = renderUpcoming({
      condition: { kind: "error" },
      model: { ...upcomingFixture, groups: [] },
    });
    expect(screen.getByText("Upcoming tasks are unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Nothing in the next 7 days")).not.toBeInTheDocument();
    emptyError.unmount();

    const offline = renderUpcoming({ condition: { kind: "offline" } });
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
    expect(screen.getByText("Outline the workshop agenda")).toBeInTheDocument();
    offline.unmount();

    renderUpcoming({
      condition: { kind: "conflict" },
      model: {
        ...upcomingFixture,
        groups: [
          {
            ...upcomingFixture.groups[0]!,
            tasks: [{ ...upcomingFixture.groups[0]!.tasks[0]!, conflicted: true }],
          },
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("A task changed elsewhere");
    expect(screen.getByText("Changed elsewhere")).toBeInTheDocument();
  });
});
