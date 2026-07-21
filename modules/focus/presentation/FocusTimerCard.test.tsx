import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  focusLinkOptions,
  focusPresentationActions,
  idleFocusTimer,
  runningFocusTimer,
} from "./focus-presentation-test-support";
import { FocusTimerCard } from "./FocusTimerCard";

describe("FocusTimerCard", () => {
  it("renders the bounded Pomodoro defaults and selects a link through a labeled combobox", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const onFocusDurationChange = vi.fn();
    const onLinkChange = vi.fn();
    renderCard({
      actions: focusPresentationActions({ onFocusDurationChange, onLinkChange, onModeChange }),
    });

    expect(screen.getByRole("radio", { name: "Pomodoro" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Focus length in minutes" })).toHaveValue(25);
    expect(screen.getByRole("spinbutton", { name: "Break length in minutes" })).toHaveValue(5);
    expect(screen.getByRole("button", { name: "Start focus" })).toHaveClass("primary-button");
    expect(screen.getByRole("button", { name: "Start break" })).toHaveClass("secondary-button");

    fireEvent.change(screen.getByRole("spinbutton", { name: "Focus length in minutes" }), {
      target: { value: "30" },
    });
    expect(onFocusDurationChange).toHaveBeenCalledWith(1_800);
    await user.click(screen.getByRole("radio", { name: "Stopwatch" }));
    expect(onModeChange).toHaveBeenCalledWith("stopwatch");

    await user.click(screen.getByRole("combobox", { name: /Link to a task or habit/u }));
    await user.type(screen.getByRole("combobox", { name: /Link to a task or habit/u }), "read");
    await user.click(screen.getByRole("option", { name: /Read for twenty minutes/u }));
    expect(onLinkChange).toHaveBeenCalledWith(focusLinkOptions[1]);
  });

  it("shows running actions and protects discard behind a safe-focus confirmation", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    renderCard({
      actions: focusPresentationActions({ onDiscard }),
      timer: runningFocusTimer(),
    });

    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Finish focus" })).toBeEnabled();
    const timer = screen.getByLabelText("20 minutes remaining");
    expect(timer).toHaveTextContent("20:00");
    expect(timer).toHaveAttribute("datetime", "PT1200S");
    expect(timer).not.toHaveAttribute("aria-live");

    const more = screen.getByRole("button", { name: "More timer actions" });
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "Discard timer…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Discard this focus timer?" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Keep timer" })).toHaveFocus());
    await user.click(within(dialog).getByRole("button", { name: "Keep timer" }));
    expect(onDiscard).not.toHaveBeenCalled();
    await waitFor(() => expect(more).toHaveFocus());
  });

  it("keeps resume and finish separate while paused", () => {
    renderCard({ timer: runningFocusTimer({ status: "paused" }) });
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Finish focus" })).toBeEnabled();
  });

  it("presents an explicit break without any item link or total claim", () => {
    renderCard({
      timer: runningFocusTimer({
        phase: "break",
        displayedElapsedSeconds: 60,
        plannedSeconds: 300,
        link: null,
      }),
    });

    expect(screen.getByText("Explicit break", { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText("Break time is kept separate from Focus history and totals."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip break" })).toBeEnabled();
    expect(screen.queryByText("Draft release notes")).not.toBeInTheDocument();
  });

  it("describes visible overtime without auto-finishing the planned session", () => {
    renderCard({ timer: runningFocusTimer({ displayedElapsedSeconds: 1_561 }) });
    expect(screen.getByLabelText("1 minute 1 second overtime")).toHaveTextContent("+01:01");
    expect(screen.getByLabelText("1 minute 1 second overtime")).toHaveAttribute("datetime", "PT61S");
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Finish focus" })).toBeEnabled();
  });

  it("keeps task and habit option ids unique when their UUIDs match", async () => {
    const user = userEvent.setup();
    const sharedId = "323b28cf-c8c2-41d6-846b-bb59d696b47c";
    renderCard({
      linkSearch: {
        query: "shared",
        status: "ready",
        options: [
          { id: sharedId, kind: "task", label: "Shared task", available: true },
          { id: sharedId, kind: "habit", label: "Shared habit", available: true },
        ],
      },
    });

    const input = screen.getByRole("combobox", { name: /Link to a task or habit/u });
    await user.type(input, "shared");
    const options = screen.getAllByRole("option");
    expect(new Set(options.map((option) => option.id))).toHaveProperty("size", 2);
    expect(input).toHaveAttribute("aria-activedescendant", options[0]?.id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1]?.id);
  });
});

function renderCard(overrides: Partial<React.ComponentProps<typeof FocusTimerCard>> = {}) {
  return render(
    <FocusTimerCard
      actions={focusPresentationActions()}
      linkSearch={{ query: "", options: focusLinkOptions, status: "ready" }}
      pendingAction={null}
      projected={false}
      timer={idleFocusTimer()}
      writesDisabled={false}
      {...overrides}
    />,
  );
}
