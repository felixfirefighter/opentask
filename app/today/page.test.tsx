import type { ReactNode } from "react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHabitToday: vi.fn(),
  getInbox: vi.fn(),
  getToday: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/habits", () => ({
  getHabitsApplication: () => ({
    projections: { getHabitToday: mocks.getHabitToday },
  }),
}));

vi.mock("@/modules/habits/presentation", () => ({
  TodayHabitsRouteSection: ({
    initialProjection,
  }: {
    initialProjection?: {
      rows: readonly unknown[];
      boundaries: readonly unknown[];
      nextCursor: string | null;
    };
  }) => (
    <section
      aria-label="Today habits route"
      data-has-initial-projection={initialProjection === undefined ? "false" : "true"}
      data-row-count={initialProjection?.rows.length ?? 0}
      data-boundary-count={initialProjection?.boundaries.length ?? 0}
      data-next-cursor={initialProjection?.nextCursor ?? ""}
    />
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/modules/planning", () => ({
  getPlanningProjectionApplication: () => ({ getToday: mocks.getToday }),
}));

vi.mock("@/modules/planning/presentation", () => ({
  TodayRouteScreen: ({
    habitSection,
    hourCycle,
    inboxId,
    projection,
  }: {
    habitSection: ReactNode;
    hourCycle: string;
    inboxId: string;
    projection: { remainingCount: number };
  }) => (
    <main
      data-testid="today-task-route"
      data-hour-cycle={hourCycle}
      data-inbox-id={inboxId}
      data-task-count={projection.remainingCount}
    >
      {habitSection}
    </main>
  ),
}));

vi.mock("@/modules/tasks", () => ({ getInbox: mocks.getInbox }));
vi.mock("@/modules/tasks/presentation", () => ({
  TaskCommandPalette: () => null,
  TaskNavigation: () => null,
}));
vi.mock("../(workspace)/_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));

import TodayPage from "./page";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const inbox = { id: "20000000-0000-4000-8000-000000000001" };
const projection = { localDate: "2026-07-21", remainingCount: 2 };

describe("TodayPage composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: { hourCycle: "h12", reducedMotion: false, theme: "system" },
    });
    mocks.getInbox.mockResolvedValue(inbox);
    mocks.getToday.mockResolvedValue(projection);
    mocks.getHabitToday.mockResolvedValue({
      rows: [{ detail: { habit: { id: "habit-1" } } }],
      boundaries: [{ timezone: "Asia/Singapore", localDate: "2026-07-21" }],
      nextCursor: "next-habit-page",
    });
  });

  it("composes the independent habit projection with the task projection", async () => {
    render(await TodayPage());

    expect(mocks.loadWorkspace).toHaveBeenCalledWith("/today");
    expect(mocks.getInbox).toHaveBeenCalledWith(actor);
    expect(mocks.getToday).toHaveBeenCalledWith(actor, { limit: 250 });
    expect(mocks.getHabitToday).toHaveBeenCalledWith(actor, { limit: 50 });
    expect(screen.getByTestId("today-task-route")).toHaveAttribute("data-task-count", "2");
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute("data-row-count", "1");
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute(
      "data-boundary-count",
      "1",
    );
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute(
      "data-next-cursor",
      "next-habit-page",
    );
  });

  it("keeps the task route available when the server habit prefetch fails", async () => {
    mocks.getHabitToday.mockRejectedValueOnce(new Error("Habit projection unavailable"));

    render(await TodayPage());

    expect(screen.getByTestId("today-task-route")).toHaveAttribute("data-task-count", "2");
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute(
      "data-has-initial-projection",
      "false",
    );
  });

  it("passes an authoritative zero-row prefetch without freezing task or habit rendering", async () => {
    mocks.getHabitToday.mockResolvedValueOnce({
      rows: [],
      boundaries: [{ timezone: "Asia/Singapore", localDate: "2026-07-21" }],
      nextCursor: "next-habit-page",
    });

    render(await TodayPage());

    expect(screen.getByTestId("today-task-route")).toHaveAttribute("data-task-count", "2");
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute(
      "data-has-initial-projection",
      "true",
    );
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute("data-row-count", "0");
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute(
      "data-boundary-count",
      "1",
    );
    expect(screen.getByRole("region", { name: "Today habits route" })).toHaveAttribute(
      "data-next-cursor",
      "next-habit-page",
    );
  });
});
