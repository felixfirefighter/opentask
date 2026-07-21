import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

const mocks = vi.hoisted(() => ({
  getHabitOverview: vi.fn(),
  getHabitMonth: vi.fn(),
  getInbox: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/habits", () => ({
  getHabitsApplication: () => ({
    projections: {
      getHabitOverview: mocks.getHabitOverview,
      getHabitMonth: mocks.getHabitMonth,
    },
  }),
}));

vi.mock("@/modules/habits/presentation", () => ({
  HabitDetailRouteScreen: ({
    initialMonth,
    initialOverview,
  }: {
    initialMonth?: { yearMonth: string };
    initialOverview: { detail: { habit: { title: string } } };
  }) => (
    <div data-testid="habit-detail" data-month={initialMonth?.yearMonth ?? ""}>
      {initialOverview.detail.habit.title}
    </div>
  ),
  HabitNavigation: ({ current, variant }: { current: string; variant?: string }) => (
    <nav data-testid={`habit-navigation-${variant ?? "sidebar"}`}>{current}</nav>
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({
    children,
    compactNavigation,
    contextNavigation,
    currentDestination,
    mobileNavigation,
  }: {
    children: ReactNode;
    compactNavigation: ReactNode;
    contextNavigation: ReactNode;
    currentDestination: string;
    mobileNavigation: null;
  }) => (
    <div
      data-current-destination={currentDestination}
      data-mobile-navigation={mobileNavigation === null ? "hidden" : "visible"}
    >
      {contextNavigation}
      {compactNavigation}
      {children}
    </div>
  ),
}));

vi.mock("@/modules/tasks", () => ({ getInbox: mocks.getInbox }));
vi.mock("@/modules/tasks/presentation", () => ({ TaskCommandPalette: () => null }));
vi.mock("../../(workspace)/_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));

import HabitDetailPage from "./page";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const habitId = "20000000-0000-4000-8000-000000000001";

function detail(archivedAt: string | null = null) {
  return { habit: { id: habitId, archivedAt }, schedule: { schedule: { kind: "daily" } } };
}

function overview(archivedAt: string | null = null) {
  return {
    detail: {
      ...detail(archivedAt),
      habit: { ...detail(archivedAt).habit, title: "Morning reset" },
    },
    localDate: "2026-07-21",
  };
}

describe("HabitDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: { reducedMotion: false, theme: "system" },
    });
    mocks.getInbox.mockResolvedValue({ id: "30000000-0000-4000-8000-000000000001" });
    mocks.getHabitOverview.mockResolvedValue(overview());
    mocks.getHabitMonth.mockResolvedValue({ yearMonth: "2026-07", days: [] });
  });

  it("loads one actor-scoped overview and current month into the full-page detail route", async () => {
    render(await HabitDetailPage({ params: Promise.resolve({ habitId }) }));

    expect(mocks.loadWorkspace).toHaveBeenCalledWith(`/habits/${habitId}`);
    expect(mocks.getHabitOverview).toHaveBeenCalledWith(actor, habitId);
    expect(mocks.getHabitMonth).toHaveBeenCalledWith(actor, habitId, { yearMonth: "2026-07" });
    expect(screen.getByTestId("habit-detail")).toHaveTextContent("Morning reset");
    expect(screen.getByTestId("habit-detail")).toHaveAttribute("data-month", "2026-07");
    expect(screen.getByTestId("habit-detail").parentElement).toHaveAttribute(
      "data-current-destination",
      "habits",
    );
    expect(screen.getByTestId("habit-detail").parentElement).toHaveAttribute(
      "data-mobile-navigation",
      "hidden",
    );
  });

  it("uses archived navigation without changing the permission-safe route", async () => {
    mocks.getHabitOverview.mockResolvedValue(overview("2026-07-20T00:00:00.000Z"));

    render(await HabitDetailPage({ params: Promise.resolve({ habitId }) }));

    expect(mocks.getHabitOverview).toHaveBeenCalledWith(actor, habitId);
    expect(screen.getByTestId("habit-navigation-sidebar")).toHaveTextContent("archived");
    expect(screen.getByTestId("habit-navigation-compact")).toHaveTextContent("archived");
  });

  it("uses one generic unavailable state for a missing or foreign habit", async () => {
    mocks.getHabitOverview.mockRejectedValue(new ApplicationError("NOT_FOUND", "private result"));

    render(await HabitDetailPage({ params: Promise.resolve({ habitId }) }));

    expect(screen.getByRole("heading", { name: "Habit unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(/private result/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("habit-detail")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to habits" })).toHaveAttribute("href", "/habits");
    expect(mocks.getHabitMonth).not.toHaveBeenCalled();
  });

  it("keeps definition/detail usable when independent monthly history cannot preload", async () => {
    mocks.getHabitMonth.mockRejectedValue(new Error("history unavailable"));

    render(await HabitDetailPage({ params: Promise.resolve({ habitId }) }));

    expect(screen.getByTestId("habit-detail")).toHaveTextContent("Morning reset");
    expect(screen.getByTestId("habit-detail")).toHaveAttribute("data-month", "");
  });
});
