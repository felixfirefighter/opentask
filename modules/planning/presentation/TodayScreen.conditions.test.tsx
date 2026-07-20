import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { todayFixture } from "./planning-screen-fixtures";
import { renderToday } from "./planning-screen-test-support";

describe("TodayScreen conditions", () => {
  it("preserves geometry and announces loading", () => {
    renderToday({ condition: { kind: "loading" } });
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText(/Loading planning tasks/u)).toBeInTheDocument();
  });

  it("keeps safe rows stale and retries an error", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderToday({ condition: { kind: "error", message: "Tasks may be out of date." }, onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("Tasks may be out of date.");
    expect(screen.getByText(todayFixture.timed[0]!.title)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not mislabel a failed empty response as an empty day", () => {
    renderToday({
      condition: { kind: "error" },
      model: { ...todayFixture, overdue: [], timed: [], anytime: [] },
    });
    expect(screen.getByText("Today's tasks are unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Nothing planned for today")).not.toBeInTheDocument();
  });

  it("keeps a truncated result visibly partial, read-only, and retryable", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderToday({
      condition: {
        kind: "partial",
        message:
          "A safety limit was reached during recurrence calculation. Some tasks or occurrences may be missing. Loaded results are read-only; retry to refresh.",
        reasons: ["recurrence_request_candidate_limit"],
        runtimeCondition: null,
      },
      onRetry,
      taskActions: { onStatusChange: vi.fn() },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("This planning view is incomplete");
    expect(screen.getByText(todayFixture.timed[0]!.title)).toBeInTheDocument();
    expect(screen.getByText(/loaded tasks/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Add a task" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /complete confirm/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not claim a truncated empty result is an empty day", () => {
    renderToday({
      condition: {
        kind: "partial",
        message: "Some tasks may be missing. Loaded results are read-only; retry to refresh.",
        reasons: ["projection_output_limit"],
        runtimeCondition: null,
      },
      model: { ...todayFixture, overdue: [], timed: [], anytime: [] },
    });
    expect(screen.getByText("Today's task list is incomplete")).toBeInTheDocument();
    expect(screen.queryByText("Nothing planned for today")).not.toBeInTheDocument();
  });

  it("leaves cached rows visible but disables writes offline", () => {
    renderToday({ condition: { kind: "offline" }, taskActions: { onStatusChange: vi.fn() } });
    expect(screen.getByText("Planning is read-only")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Add a task" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /complete confirm/i })).toBeDisabled();
  });

  it("does not expose task metadata in the permission state", () => {
    renderToday({ condition: { kind: "permission" } });
    expect(screen.getByRole("heading", { name: "This planning view is unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(todayFixture.timed[0]!.title)).not.toBeInTheDocument();
  });

  it("names conflicts and offers the latest task details", () => {
    renderToday({
      condition: { kind: "conflict" },
      model: {
        ...todayFixture,
        timed: [{ ...todayFixture.timed[0]!, conflicted: true }],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("A task changed elsewhere");
    expect(screen.getByText("Changed elsewhere")).toBeInTheDocument();
  });

  it("preserves quick-add text across a local date change", async () => {
    const user = userEvent.setup();
    const onReturnToToday = vi.fn();
    renderToday({
      condition: { kind: "date-changed", currentDateLabel: "Tuesday, 21 July" },
      onReturnToToday,
    });
    expect(screen.getByRole("textbox", { name: "Add a task" })).toHaveValue("Call Sam tomorrow at 3pm");
    expect(screen.getByRole("textbox", { name: "Add a task" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Return to Today" }));
    expect(onReturnToToday).toHaveBeenCalledOnce();
  });
});
