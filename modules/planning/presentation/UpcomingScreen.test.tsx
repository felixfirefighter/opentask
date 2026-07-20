import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { upcomingFixture } from "./planning-screen-fixtures";
import { UpcomingScreen, type UpcomingScreenProps } from "./UpcomingScreen";

function renderUpcoming(overrides: Partial<UpcomingScreenProps> = {}) {
  const props: UpcomingScreenProps = {
    model: upcomingFixture,
    condition: { kind: "ready" },
    quickAdd: {
      value: "",
      destinationLabel: "Upcoming · Next local day unless a date is recognized",
      submitting: false,
      tokens: [],
    },
    taskActions: {},
    onQuickAddChange: vi.fn(),
    onQuickAddSubmit: vi.fn(),
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

  it("uses the exact empty destination while keeping creation in the contextual composer", () => {
    renderUpcoming({ model: { ...upcomingFixture, groups: [], totalLabel: "0 tasks" } });
    expect(screen.getByRole("heading", { name: "Nothing in the next 7 days" })).toBeInTheDocument();
  });

  it("hides private rows when permission is unavailable", () => {
    renderUpcoming({ condition: { kind: "permission" } });
    expect(screen.getByText("This planning view is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Outline the workshop agenda")).not.toBeInTheDocument();
  });

  it("keeps loaded rows and the quick-add draft read-only during a local-date refresh", () => {
    renderUpcoming({
      condition: { kind: "date-changed", currentDateLabel: "Tuesday, 21 July" },
      quickAdd: {
        value: "Keep this draft",
        destinationLabel: "Upcoming · Next local day unless a date is recognized",
      },
    });

    expect(screen.getByRole("textbox", { name: "Add a task" })).toHaveValue("Keep this draft");
    expect(screen.getByRole("textbox", { name: "Add a task" })).toBeDisabled();
    expect(screen.getByText("Outline the workshop agenda")).toBeInTheDocument();
  });

  it("labels truncated groups as partial and disables every task mutation", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderUpcoming({
      condition: {
        kind: "partial",
        message:
          "A safety limit was reached during recurrence history loading. Some tasks or occurrences may be missing. Loaded results are read-only; retry to refresh.",
        reasons: ["recurrence_event_source_limit"],
        runtimeCondition: null,
      },
      onRetry,
      taskActions: { onStatusChange: vi.fn() },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("This planning view is incomplete");
    expect(screen.getByText("Outline the workshop agenda")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Add a task" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /complete/i })[0]).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not claim a truncated empty result is an empty range", () => {
    renderUpcoming({
      condition: {
        kind: "partial",
        message: "Some tasks may be missing. Loaded results are read-only; retry to refresh.",
        reasons: ["recurrence_output_limit"],
        runtimeCondition: null,
      },
      model: { ...upcomingFixture, groups: [] },
    });
    expect(screen.getByText("Upcoming task list is incomplete")).toBeInTheDocument();
    expect(screen.queryByText("Nothing in the next 7 days")).not.toBeInTheDocument();
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
    expect(
      screen.getAllByRole("button", { name: "Add task" }).every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
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
