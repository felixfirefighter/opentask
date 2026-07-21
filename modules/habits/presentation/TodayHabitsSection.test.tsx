import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { habitTodayRow } from "./habit-presentation-test-support";
import { TodayHabitsSection } from "./TodayHabitsSection";

describe("TodayHabitsSection", () => {
  it("renders scheduled habits as a semantic final work section", () => {
    renderWithClient(
      <TodayHabitsSection condition={{ kind: "ready" }} onRetry={() => undefined} rows={[habitTodayRow()]} />,
    );

    expect(screen.getByRole("heading", { name: "Habits", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("1 scheduled practice")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Morning walk/u })).toHaveAttribute(
      "href",
      "/habits/3db2d92f-4a43-4e9d-a772-29a13fa59d93",
    );
    expect(screen.getByText("Mint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check in" })).toBeEnabled();
  });

  it("does not prompt another weekly check-in after the target is achieved", () => {
    renderWithClient(
      <TodayHabitsSection
        condition={{ kind: "ready" }}
        onRetry={() => undefined}
        rows={[
          habitTodayRow({
            weeklyProgress: {
              completedDays: 3,
              targetPerWeek: 3,
              achieved: true,
              open: false,
            },
            requiresAction: false,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Achieved", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More check-in actions/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check in" })).not.toBeInTheDocument();
  });

  it("keeps loaded rows visible but read-only when offline", () => {
    renderWithClient(
      <TodayHabitsSection
        condition={{ kind: "offline" }}
        onRetry={() => undefined}
        rows={[habitTodayRow()]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Habits are read-only");
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
    expect(screen.getByText("Reconnect to change this habit.")).toBeInTheDocument();
  });

  it("keeps stale rows read-only after an error while leaving retry available", () => {
    const onRetry = vi.fn();
    renderWithClient(
      <TodayHabitsSection
        condition={{ kind: "error", message: "Today's habits could not be refreshed." }}
        onRetry={onRetry}
        rows={[habitTodayRow()]}
      />,
    );

    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
    expect(screen.getByText("Refresh habits before making changes.")).toBeInTheDocument();
    expect(screen.queryByText("Reconnect to change this habit.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("does not render an empty subsection when no habits are scheduled", () => {
    const { container } = renderWithClient(
      <TodayHabitsSection condition={{ kind: "ready" }} onRetry={() => undefined} rows={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("does not claim an empty day while another scheduled-habit page exists", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderWithClient(
      <TodayHabitsSection
        condition={{ kind: "ready" }}
        hasNextPage
        onLoadMore={onLoadMore}
        onRetry={() => undefined}
        rows={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Habits", level: 2 })).toBeInTheDocument();
    expect(screen.queryByText("No habits are scheduled")).not.toBeInTheDocument();
    expect(screen.getByText("No scheduled practices are loaded from this page yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more habits" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("keeps loaded Today rows available after a next-page error", () => {
    renderWithClient(
      <TodayHabitsSection
        condition={{ kind: "ready" }}
        hasNextPage
        loadMoreError="More habits could not be loaded. Loaded habits remain available."
        onLoadMore={() => undefined}
        onRetry={() => undefined}
        rows={[habitTodayRow()]}
      />,
    );

    expect(screen.getByRole("link", { name: /Morning walk/u })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Loaded habits remain available");
    expect(screen.getByRole("button", { name: "Retry loading more habits" })).toBeEnabled();
  });

  it("disables Today pagination with an explanation while offline", () => {
    renderWithClient(
      <TodayHabitsSection
        condition={{ kind: "offline" }}
        hasNextPage
        onLoadMore={() => undefined}
        onRetry={() => undefined}
        rows={[habitTodayRow()]}
      />,
    );

    expect(screen.getByText("Reconnect to load more habits.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more habits" })).toBeDisabled();
  });
});

function renderWithClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
