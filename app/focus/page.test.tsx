import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveFocusSession: vi.fn(),
  getFocusSummary: vi.fn(),
  listRecentFocusSessions: vi.fn(),
  getInbox: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/focus", () => ({
  getFocusApplication: () => ({
    getActiveFocusSession: mocks.getActiveFocusSession,
    getFocusSummary: mocks.getFocusSummary,
    listRecentFocusSessions: mocks.listRecentFocusSessions,
  }),
}));
vi.mock("@/modules/focus/presentation", () => ({
  FocusRouteScreen: ({
    hourCycle,
    initialActive,
    timeZone,
  }: {
    hourCycle: string;
    initialActive?: unknown;
    timeZone: string;
  }) => (
    <section
      aria-label="Focus route"
      data-active={initialActive === undefined ? "client" : initialActive === null ? "idle" : "running"}
      data-hour-cycle={hourCycle}
      data-timezone={timeZone}
    />
  ),
}));
vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({
    children,
    currentDestination,
  }: {
    children: React.ReactNode;
    currentDestination: string;
  }) => <main data-current-destination={currentDestination}>{children}</main>,
}));
vi.mock("@/modules/tasks", () => ({ getInbox: mocks.getInbox }));
vi.mock("@/modules/tasks/presentation", () => ({ TaskCommandPalette: () => <div /> }));
vi.mock("../(workspace)/_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));

import FocusPage from "./page";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };

describe("Focus page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor, displayName: "Ada", email: "ada@example.test" },
      preferences: {
        theme: "light",
        reducedMotion: false,
        timezone: "Asia/Singapore",
        hourCycle: "h23",
      },
    });
    mocks.getInbox.mockResolvedValue({ id: "inbox", name: "Inbox" });
    mocks.getActiveFocusSession.mockResolvedValue(null);
    mocks.getFocusSummary.mockResolvedValue({ todaySeconds: 1_500 });
    mocks.listRecentFocusSessions.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("loads one actor-scoped authoritative Focus snapshot into the Focus shell", async () => {
    render(await FocusPage());

    expect(mocks.loadWorkspace).toHaveBeenCalledWith("/focus");
    expect(mocks.getActiveFocusSession).toHaveBeenCalledWith(actor);
    expect(mocks.getFocusSummary).not.toHaveBeenCalled();
    expect(mocks.listRecentFocusSessions).not.toHaveBeenCalled();
    expect(screen.getByRole("main")).toHaveAttribute("data-current-destination", "focus");
    expect(screen.getByRole("region", { name: "Focus route" })).toHaveAttribute(
      "data-timezone",
      "Asia/Singapore",
    );
    expect(screen.getByRole("region", { name: "Focus route" })).toHaveAttribute("data-hour-cycle", "h23");
  });

  it("does not gate the authoritative timer on secondary server reads", async () => {
    mocks.getFocusSummary.mockRejectedValue(new Error("summary unavailable"));
    mocks.listRecentFocusSessions.mockRejectedValue(new Error("history unavailable"));

    render(await FocusPage());

    const route = screen.getByRole("region", { name: "Focus route" });
    expect(route).toHaveAttribute("data-active", "idle");
    expect(mocks.getFocusSummary).not.toHaveBeenCalled();
    expect(mocks.listRecentFocusSessions).not.toHaveBeenCalled();
  });

  it("renders the guarded client timer state when the active prefetch fails", async () => {
    mocks.getActiveFocusSession.mockRejectedValue(new Error("active timer unavailable"));

    render(await FocusPage());

    expect(screen.getByRole("region", { name: "Focus route" })).toHaveAttribute("data-active", "client");
  });
});
