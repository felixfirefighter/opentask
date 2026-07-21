import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  focusHistoryItem,
  focusLinkOptions,
  focusPresentationActions,
} from "./focus-presentation-test-support";
import { FocusHistory } from "./FocusHistory";

describe("FocusHistory", () => {
  it("names the empty state and never renders completed break rows", () => {
    renderHistory({
      history: {
        kind: "ready",
        items: [focusHistoryItem({ id: "break-1", kind: "break", durationSeconds: 300 })],
      },
    });

    expect(screen.getByRole("heading", { name: "No focus sessions yet", level: 3 })).toBeInTheDocument();
    expect(screen.queryByText("5 min")).not.toBeInTheDocument();
  });

  it("corrects a completed duration with focus inside the dialog and return to the row action", async () => {
    const user = userEvent.setup();
    const onCorrect = vi.fn().mockResolvedValue(true);
    renderHistory({
      actions: focusPresentationActions({ onCorrect }),
      linkSearch: { query: "", options: focusLinkOptions, status: "ready" },
    });

    const more = screen.getByRole("button", {
      name: "More actions for focus session completed today at 10:30 AM",
    });
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "Correct duration…" }));
    const dialog = screen.getByRole("dialog", { name: "Correct focus duration" });
    const duration = within(dialog).getByRole("spinbutton", { name: "Duration (seconds)" });
    await waitFor(() => expect(duration).toHaveFocus());
    await user.clear(duration);
    await user.type(duration, "1800");
    await user.click(within(dialog).getByRole("button", { name: "Save correction" }));

    expect(onCorrect).toHaveBeenCalledWith("history-1", { durationSeconds: 1_800 });
    await waitFor(() => expect(more).toHaveFocus());
  });

  it("keeps the duration and link draft open until correction succeeds", async () => {
    const user = userEvent.setup();
    let resolveFirst: (confirmed: boolean) => void = () => undefined;
    const firstAttempt = new Promise<boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const onCorrect = vi
      .fn()
      .mockImplementationOnce(() => firstAttempt)
      .mockResolvedValueOnce(true);
    renderHistory({
      actions: focusPresentationActions({ onCorrect }),
      linkSearch: { query: "", options: focusLinkOptions, status: "ready" },
    });

    const more = screen.getByRole("button", {
      name: "More actions for focus session completed today at 10:30 AM",
    });
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "Correct duration…" }));
    const dialog = screen.getByRole("dialog", { name: "Correct focus duration" });
    const duration = within(dialog).getByRole("spinbutton", { name: "Duration (seconds)" });
    await user.clear(duration);
    await user.type(duration, "1800");
    await user.click(within(dialog).getByRole("button", { name: "Remove link to Draft release notes" }));
    const linkSearch = within(dialog).getByRole("combobox", { name: /Link to a task or habit/u });
    await user.type(linkSearch, "read");
    await user.click(within(dialog).getByRole("option", { name: "Read for twenty minutes, Habit" }));
    await user.click(within(dialog).getByRole("button", { name: "Save correction" }));

    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(duration).toHaveValue(1_800);
    expect(within(dialog).getByText("Read for twenty minutes")).toBeVisible();

    await act(async () => resolveFirst(false));
    const error = await within(dialog).findByRole("alert");
    expect(error).toHaveTextContent("Your draft is still here");
    expect(error).toHaveFocus();
    expect(duration).toHaveValue(1_800);
    expect(within(dialog).getByText("Read for twenty minutes")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Correct focus duration" })).toBeNull());
    await waitFor(() => expect(more).toHaveFocus());
    expect(onCorrect).toHaveBeenCalledTimes(2);
    expect(onCorrect).toHaveBeenLastCalledWith("history-1", {
      durationSeconds: 1_800,
      link: { id: "habit-1", kind: "habit" },
    });
  });

  it("puts safe focus first before irreversible deletion and returns it after cancellation", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderHistory({ actions: focusPresentationActions({ onDelete }) });

    const more = screen.getByRole("button", {
      name: "More actions for focus session completed today at 10:30 AM",
    });
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "Delete session…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this focus session?" });
    const keep = within(dialog).getByRole("button", { name: "Keep session" });
    await waitFor(() => expect(keep).toHaveFocus());
    await user.click(keep);

    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(more).toHaveFocus());
  });

  it("preserves loaded rows under a scoped history error", () => {
    renderHistory({
      history: {
        kind: "error",
        message: "Recent sessions could not be refreshed.",
        items: [focusHistoryItem()],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Recent sessions could not be refreshed.");
    expect(screen.getByText("25 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry history" })).toBeEnabled();
  });
});

function renderHistory(overrides: Partial<React.ComponentProps<typeof FocusHistory>> = {}) {
  return render(
    <FocusHistory
      actions={focusPresentationActions()}
      disabled={false}
      history={{ kind: "ready", items: [focusHistoryItem()] }}
      linkSearch={{ query: "", options: [], status: "idle" }}
      pendingAction={null}
      {...overrides}
    />,
  );
}
