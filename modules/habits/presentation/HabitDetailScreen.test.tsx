import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { habitMonth, habitOverview } from "./habit-presentation-test-support";
import { HabitDetailScreen } from "./HabitDetailScreen";

describe("HabitDetailScreen", () => {
  it("confirms archive consequences while keeping edit, check-in, and month targets separate", async () => {
    const user = userEvent.setup();
    const actions = {
      edit: vi.fn(),
      lifecycle: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    };
    renderDetail({
      month: habitMonth(),
      onEdit: actions.edit,
      onLifecycle: actions.lifecycle,
      onNextMonth: actions.next,
      onPreviousMonth: actions.previous,
    });

    expect(screen.getByRole("heading", { name: "Morning walk", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check in" })).toBeEnabled();
    expect(screen.getByRole("table", { name: /July 2026 history/u })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit habit" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const archiveDialog = screen.getByRole("alertdialog", { name: "Archive “Morning walk”?" });
    expect(archiveDialog).toHaveTextContent("History will be preserved");
    expect(archiveDialog).toHaveTextContent("leave Today and your active habits");
    expect(actions.lifecycle).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(within(archiveDialog).getByRole("button", { name: "Keep habit" })).toHaveFocus(),
    );
    await user.click(within(archiveDialog).getByRole("button", { name: "Keep habit" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toHaveFocus();
    expect(actions.lifecycle).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Archive habit" }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));

    expect(actions.edit).toHaveBeenCalledOnce();
    expect(actions.lifecycle).toHaveBeenCalledOnce();
    expect(actions.previous).toHaveBeenCalledOnce();
    expect(actions.next).toHaveBeenCalledOnce();
  });

  it("renders the named category token beside the habit title", () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "Morning walk", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Mint")).toBeInTheDocument();
  });

  it("restores an archived habit directly without showing archive confirmation", async () => {
    const user = userEvent.setup();
    const onLifecycle = vi.fn();
    const current = habitOverview();
    renderDetail({
      onLifecycle,
      overview: {
        ...current,
        detail: {
          ...current.detail,
          habit: { ...current.detail.habit, archivedAt: "2026-07-20T02:00:00.000Z" },
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(onLifecycle).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps history failure scoped after the core definition loads", () => {
    renderDetail({ historyError: true }, { withoutMonth: true });

    expect(screen.getByRole("heading", { name: "Morning walk", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("History could not be loaded");
    expect(screen.getByRole("button", { name: "Retry history" })).toBeInTheDocument();
  });

  it("names an empty monthly history without implying failure", () => {
    const month = habitMonth();
    renderDetail({
      month: {
        ...month,
        days: month.days.map((day) => ({ ...day, log: null, successful: false })),
      },
    });

    expect(screen.getByText("No check-ins yet")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /July 2026 history/u })).toBeInTheDocument();
  });

  it("uses a generic page-level permission state that does not reveal the habit", () => {
    renderDetail({ condition: { kind: "permission" } });

    expect(
      screen.getByRole("heading", { name: "This habit view is unavailable", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Morning walk")).not.toBeInTheDocument();
  });

  it("keeps stale detail data read-only after an error while leaving retry available", () => {
    renderDetail({ condition: { kind: "error", message: "The habit could not be refreshed." } });

    expect(screen.getByRole("button", { name: "Edit habit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
    expect(screen.getByText("Refresh habits before making changes.")).toBeInTheDocument();
    expect(screen.queryByText("Reconnect to change this habit.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("keeps conflicted detail data read-only while review and retry remain available", () => {
    renderDetail({
      condition: {
        kind: "conflict",
        message: "Review the current habit before making another change.",
      },
    });

    expect(screen.getByRole("button", { name: "Edit habit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
    expect(screen.getByText("Review the latest habit before making changes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review latest" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});

function renderDetail(
  overrides: Partial<React.ComponentProps<typeof HabitDetailScreen>> = {},
  options: Readonly<{ withoutMonth?: boolean }> = {},
) {
  const baseProps = {
    condition: { kind: "ready" },
    historyError: false,
    historyLoading: false,
    onEdit: () => undefined,
    onLifecycle: () => undefined,
    onNextMonth: () => undefined,
    onPreviousMonth: () => undefined,
    onRetry: () => undefined,
    onRetryHistory: () => undefined,
    overview: habitOverview(),
    pending: false,
  } satisfies Omit<React.ComponentProps<typeof HabitDetailScreen>, "month">;
  const props: React.ComponentProps<typeof HabitDetailScreen> = {
    ...baseProps,
    ...(options.withoutMonth ? {} : { month: habitMonth() }),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HabitDetailScreen {...props} />
    </QueryClientProvider>,
  );
}
