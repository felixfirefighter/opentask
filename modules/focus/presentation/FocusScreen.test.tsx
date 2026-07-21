import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  focusHistoryItem,
  focusLinkOptions,
  focusPresentationActions,
  readyFocusActive,
  runningFocusTimer,
} from "./focus-presentation-test-support";
import { FocusScreen } from "./FocusScreen";

describe("FocusScreen", () => {
  it("keeps loading geometry stable without guessing the authoritative countdown", () => {
    renderScreen({ active: { kind: "loading" }, history: { kind: "loading" }, summary: { kind: "loading" } });

    expect(screen.getByRole("heading", { name: "Focus", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Loading authoritative timer state")).toBeInTheDocument();
    expect(screen.queryByText("25:00")).not.toBeInTheDocument();
  });

  it("does not expose Start when the active timer lookup fails", async () => {
    const user = userEvent.setup();
    const onRetryActive = vi.fn();
    renderScreen({
      actions: focusPresentationActions({ onRetryActive }),
      active: { kind: "error", message: "The server did not confirm whether a timer exists." },
    });

    expect(
      screen.getByText(/Starting is disabled until the authoritative timer can be checked/u),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start focus" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry timer" }));
    expect(onRetryActive).toHaveBeenCalledOnce();
  });

  it("keeps the timer usable when only recent history fails", () => {
    renderScreen({
      history: { kind: "error", message: "History timed out." },
    });

    expect(screen.getByRole("button", { name: "Start focus" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("History timed out.");
    expect(screen.getByRole("button", { name: "Retry history" })).toBeEnabled();
  });

  it("labels an offline projection and disables timer and history writes", async () => {
    const user = userEvent.setup();
    renderScreen({
      active: { kind: "offline", timer: runningFocusTimer() },
      history: { kind: "ready", items: [focusHistoryItem()] },
    });

    expect(screen.getByText("Not connected; timer may still be running.", { exact: false })).toBeVisible();
    expect(screen.getByText("Projected from the last server update")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finish focus" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "More actions for focus session completed today at 10:30 AM",
      }),
    );
    expect(screen.getByRole("menuitem", { name: "Correct duration…" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: "Delete session…" })).toHaveAttribute("data-disabled");
  });

  it("announces conflict recovery once while rendering the authoritative controls", () => {
    renderScreen({
      active: {
        kind: "conflict",
        message: "Another start won the race. This running timer is now authoritative.",
        timer: runningFocusTimer(),
      },
      announcement: "Running Pomodoro recovered from the server.",
    });

    expect(screen.getByText("Authoritative timer recovered")).toBeVisible();
    expect(screen.getByText("Running Pomodoro recovered from the server.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
  });

  it("keeps a failed mutation's last timer visible but disables another write until refresh", () => {
    renderScreen({
      active: {
        kind: "mutation-error",
        message: "The timer may still be running. Refresh before trying another action.",
        timer: runningFocusTimer(),
      },
    });

    expect(screen.getByText("Timer change was not confirmed")).toBeVisible();
    expect(screen.getByLabelText("20 minutes remaining")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh timer" })).toBeEnabled();
  });

  it("labels a failed cached timer refresh as stale read state and disables writes", () => {
    renderScreen({
      active: {
        kind: "read-stale",
        message: "The latest server state could not be loaded.",
        timer: runningFocusTimer(),
      },
    });

    expect(screen.getByText("Timer refresh failed")).toBeVisible();
    expect(screen.queryByText("Timer change was not confirmed")).not.toBeInTheDocument();
    expect(screen.getByText("Projected from the last server update")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry timer" })).toBeEnabled();
  });

  it("keeps cached totals visible when their refresh fails", () => {
    renderScreen({
      summary: {
        kind: "error",
        message: "Saved Focus totals could not be refreshed.",
        cached: { todaySeconds: 1_500, sevenDaySeconds: 5_400 },
      },
    });

    expect(screen.getByRole("button", { name: "Retry totals" })).toBeEnabled();
    expect(screen.getByText("25 min")).toBeVisible();
    expect(screen.getByText("1 hr 30 min")).toBeVisible();
  });

  it("does not render private summary or history in the permission state", () => {
    renderScreen({ active: { kind: "permission" } });

    expect(screen.getByRole("heading", { name: "Focus is unavailable", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent sessions" })).not.toBeInTheDocument();
  });
});

function renderScreen(overrides: Partial<React.ComponentProps<typeof FocusScreen>> = {}) {
  return render(
    <FocusScreen
      actions={focusPresentationActions()}
      active={readyFocusActive()}
      history={{ kind: "ready", items: [] }}
      linkSearch={{ query: "", options: focusLinkOptions, status: "idle" }}
      summary={{ kind: "ready", todaySeconds: 1_500, sevenDaySeconds: 5_400 }}
      {...overrides}
    />,
  );
}
