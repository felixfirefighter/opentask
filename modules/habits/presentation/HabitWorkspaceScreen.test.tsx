import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { habitOverview } from "./habit-presentation-test-support";
import { HabitWorkspaceScreen } from "./HabitWorkspaceScreen";

describe("HabitWorkspaceScreen", () => {
  it("offers a single clear create action for an empty active workspace", () => {
    const onCreate = vi.fn();
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "ready" }}
        lifecycle="active"
        onCreate={onCreate}
        onRetry={() => undefined}
        overviews={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Habits", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No habits yet", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create habit" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute("aria-current", "page");
  });

  it("gives each habit row a concise exact details-link name", () => {
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "ready" }}
        lifecycle="active"
        onCreate={() => undefined}
        onRetry={() => undefined}
        overviews={[habitOverview()]}
      />,
    );

    expect(screen.getByRole("link", { name: "Open Morning walk" })).toHaveAttribute(
      "href",
      "/habits/3db2d92f-4a43-4e9d-a772-29a13fa59d93",
    );
  });

  it("shows preserved archived history without exposing a check-in action", () => {
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "ready" }}
        lifecycle="archived"
        onCreate={() => undefined}
        onRetry={() => undefined}
        overviews={[
          habitOverview({
            detail: {
              ...habitOverview().detail,
              habit: {
                ...habitOverview().detail.habit,
                archivedAt: "2026-07-20T02:00:00.000Z",
              },
            },
          }),
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Morning walk/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check in" })).not.toBeInTheDocument();
  });

  it("preserves the route controls and shows summary-shaped loading state", () => {
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "loading" }}
        lifecycle="active"
        onCreate={() => undefined}
        onRetry={() => undefined}
        overviews={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Habits", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading habits");
    expect(screen.getByRole("button", { name: "Create habit" })).toBeDisabled();
  });

  it("keeps loaded habits read-only after a refresh error while leaving retry available", () => {
    const onRetry = vi.fn();
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "error", message: "The latest habits could not be loaded." }}
        lifecycle="active"
        onCreate={() => undefined}
        onRetry={onRetry}
        overviews={[habitOverview()]}
      />,
    );

    expect(screen.getByRole("button", { name: "Create habit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
    expect(screen.getByText("Refresh habits before making changes.")).toBeInTheDocument();
    expect(screen.queryByText("Reconnect to change this habit.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("continues only through an explicit load-more action", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "ready" }}
        hasNextPage
        lifecycle="active"
        onCreate={() => undefined}
        onLoadMore={onLoadMore}
        onRetry={() => undefined}
        overviews={[habitOverview()]}
      />,
    );

    expect(screen.getByText("1 loaded active habit")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more habits" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("preserves loaded rows and offers the scoped continuation retry", () => {
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "ready" }}
        hasNextPage
        lifecycle="active"
        loadMoreError="More habits could not be loaded. Loaded habits remain available."
        onCreate={() => undefined}
        onLoadMore={() => undefined}
        onRetry={() => undefined}
        overviews={[habitOverview()]}
      />,
    );

    expect(screen.getByRole("link", { name: "Open Morning walk" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Loaded habits remain available");
    expect(screen.getByRole("button", { name: "Retry loading more habits" })).toBeEnabled();
  });

  it("explains why pagination is disabled while offline", () => {
    renderWithClient(
      <HabitWorkspaceScreen
        condition={{ kind: "offline" }}
        hasNextPage
        lifecycle="active"
        onCreate={() => undefined}
        onLoadMore={() => undefined}
        onRetry={() => undefined}
        overviews={[habitOverview()]}
      />,
    );

    expect(screen.getByText("Reconnect to load more habits.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more habits" })).toBeDisabled();
  });
});

function renderWithClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
