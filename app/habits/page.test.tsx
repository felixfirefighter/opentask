import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  getToday: vi.fn(),
  listHabitOverviews: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/habits", () => ({
  getHabitsApplication: () => ({
    projections: { listHabitOverviews: mocks.listHabitOverviews },
  }),
}));

vi.mock("@/modules/habits/presentation", () => ({
  HabitNavigation: ({ current, variant }: { current: string; variant?: string }) => (
    <nav data-testid={`habit-navigation-${variant ?? "sidebar"}`}>{current}</nav>
  ),
  HabitWorkspaceRouteScreen: ({
    initialPage,
    lifecycle,
    localDate,
    timezone,
  }: {
    initialPage: { items: readonly unknown[]; nextCursor: string | null };
    lifecycle: string;
    localDate: string;
    timezone: string;
  }) => (
    <div
      data-testid="habit-workspace"
      data-count={initialPage.items.length}
      data-lifecycle={lifecycle}
      data-local-date={localDate}
      data-next-cursor={initialPage.nextCursor ?? ""}
      data-timezone={timezone}
    />
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({
    children,
    compactNavigation,
    contextNavigation,
    currentDestination,
    destinationTitle,
  }: {
    children: ReactNode;
    compactNavigation: ReactNode;
    contextNavigation: ReactNode;
    currentDestination: string;
    destinationTitle: string;
  }) => (
    <div data-current-destination={currentDestination} data-destination-title={destinationTitle}>
      {contextNavigation}
      {compactNavigation}
      {children}
    </div>
  ),
}));

vi.mock("@/modules/planning", () => ({
  getPlanningProjectionApplication: () => ({ getToday: mocks.getToday }),
}));

vi.mock("@/modules/tasks", () => ({ getInbox: mocks.getInbox }));
vi.mock("@/modules/tasks/presentation", () => ({ TaskCommandPalette: () => null }));
vi.mock("../(workspace)/_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));

import HabitPage from "./page";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };

describe("HabitPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: {
        hourCycle: "h12",
        reducedMotion: false,
        theme: "system",
        timezone: "Asia/Singapore",
      },
    });
    mocks.getInbox.mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000001",
      name: "Inbox",
    });
    mocks.getToday.mockResolvedValue({ localDate: "2026-07-21" });
    mocks.listHabitOverviews.mockResolvedValue({
      items: [{ detail: { habit: { id: "habit" } } }],
      nextCursor: "next-habit-page",
    });
  });

  it("loads active habit projections and authoritative local-date defaults in parallel composition", async () => {
    render(await HabitPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.loadWorkspace).toHaveBeenCalledWith("/habits");
    expect(mocks.getInbox).toHaveBeenCalledWith(actor);
    expect(mocks.listHabitOverviews).toHaveBeenCalledWith(actor, { lifecycle: "active", limit: 50 });
    expect(mocks.getToday).toHaveBeenCalledWith(actor, { limit: 1 });
    expect(screen.getByTestId("habit-workspace")).toHaveAttribute("data-lifecycle", "active");
    expect(screen.getByTestId("habit-workspace")).toHaveAttribute("data-local-date", "2026-07-21");
    expect(screen.getByTestId("habit-workspace")).toHaveAttribute("data-timezone", "Asia/Singapore");
    expect(screen.getByTestId("habit-workspace")).toHaveAttribute("data-next-cursor", "next-habit-page");
    expect(screen.getByTestId("habit-workspace").parentElement).toHaveAttribute(
      "data-current-destination",
      "habits",
    );
  });

  it("preserves only the released archived view in authentication and navigation state", async () => {
    render(
      await HabitPage({
        searchParams: Promise.resolve({ view: "archived", ignored: "value" }),
      }),
    );

    expect(mocks.loadWorkspace).toHaveBeenCalledWith("/habits?view=archived");
    expect(mocks.listHabitOverviews).toHaveBeenCalledWith(actor, { lifecycle: "archived", limit: 50 });
    expect(screen.getByTestId("habit-workspace")).toHaveAttribute("data-lifecycle", "archived");
    expect(screen.getByTestId("habit-navigation-sidebar")).toHaveTextContent("archived");
    expect(screen.getByTestId("habit-navigation-compact")).toHaveTextContent("archived");
    expect(screen.getByTestId("habit-workspace").parentElement).toHaveAttribute(
      "data-destination-title",
      "Archived habits",
    );
  });

  it("falls back to active for duplicate or unsupported view parameters", async () => {
    render(await HabitPage({ searchParams: Promise.resolve({ view: ["archived", "active"] }) }));

    expect(mocks.loadWorkspace).toHaveBeenCalledWith("/habits");
    expect(mocks.listHabitOverviews).toHaveBeenCalledWith(actor, { lifecycle: "active", limit: 50 });
  });
});
