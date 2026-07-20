import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

const mocks = vi.hoisted(() => ({
  getCapability: vi.fn(),
  getInbox: vi.fn(),
  getProposal: vi.fn(),
  getToday: vi.fn(),
  getEisenhower: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/assistant", () => ({
  getAssistantPlannerApplication: () => ({ getProposal: mocks.getProposal }),
  getPlannerCapability: mocks.getCapability,
  plannerProposalDtoSchema: {
    shape: {
      id: {
        safeParse: (value: unknown) =>
          typeof value === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
            ? { success: true, data: value }
            : { success: false },
      },
    },
  },
}));

vi.mock("@/modules/assistant/presentation", () => ({
  AssistantPlannerRouteScreen: ({
    initialProposal,
    initialProposalUnavailable,
  }: {
    initialProposal?: { id: string; status: string } | null;
    initialProposalUnavailable?: boolean;
  }) => (
    <div
      data-testid="assistant-route"
      data-proposal-id={initialProposal?.id ?? "none"}
      data-proposal-status={initialProposal?.status ?? "none"}
      data-proposal-unavailable={initialProposalUnavailable ? "true" : "false"}
    />
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/modules/planning", () => ({
  getPlanningProjectionApplication: () => ({
    getToday: mocks.getToday,
    getEisenhower: mocks.getEisenhower,
  }),
}));

vi.mock("@/modules/tasks", () => ({ getInbox: mocks.getInbox }));
vi.mock("@/modules/tasks/presentation", () => ({ TaskCommandPalette: () => null }));
vi.mock("../(workspace)/_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));

import PlanPage from "./page";

const actor = { userId: "00000000-0000-4000-8000-000000000001" };
const proposalId = "88888888-8888-4888-8888-888888888888";

describe("PlanPage proposal restoration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: {
        theme: "system",
        reducedMotion: false,
        timezone: "Asia/Singapore",
      },
    });
    mocks.getCapability.mockReturnValue({ state: "available" });
    mocks.getInbox.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000099" });
    mocks.getToday.mockResolvedValue({ localDate: "2026-07-20" });
    mocks.getEisenhower.mockResolvedValue({
      doNow: [],
      plan: [],
      timeSensitive: [],
      later: [],
    });
  });

  it("loads a persisted proposal through the actor-scoped application service", async () => {
    mocks.getProposal.mockResolvedValue({ id: proposalId, status: "pending" });

    render(await PlanPage({ searchParams: Promise.resolve({ proposal: proposalId }) }));

    expect(mocks.loadWorkspace).toHaveBeenCalledWith(`/plan?proposal=${proposalId}`);
    expect(mocks.getProposal).toHaveBeenCalledWith(actor, proposalId);
    expect(screen.getByTestId("assistant-route")).toHaveAttribute("data-proposal-id", proposalId);
    expect(screen.getByTestId("assistant-route")).toHaveAttribute("data-proposal-status", "pending");
    expect(screen.getByTestId("assistant-route")).toHaveAttribute("data-proposal-unavailable", "false");
  });

  it("restores an applied lifecycle without inventing a client apply result", async () => {
    mocks.getProposal.mockResolvedValue({ id: proposalId, status: "applied" });

    render(await PlanPage({ searchParams: Promise.resolve({ proposal: proposalId }) }));

    expect(screen.getByTestId("assistant-route")).toHaveAttribute("data-proposal-status", "applied");
  });

  it("uses one generic unavailable state for malformed, missing, or foreign proposal IDs", async () => {
    const malformed = render(
      await PlanPage({ searchParams: Promise.resolve({ proposal: "not-a-proposal" }) }),
    );
    expect(mocks.getProposal).not.toHaveBeenCalled();
    expect(screen.getByTestId("assistant-route")).toHaveAttribute("data-proposal-unavailable", "true");
    malformed.unmount();

    mocks.getProposal.mockRejectedValue(
      new ApplicationError("NOT_FOUND", "The requested planner proposal was not found."),
    );
    render(await PlanPage({ searchParams: Promise.resolve({ proposal: proposalId }) }));
    expect(screen.getByTestId("assistant-route")).toHaveAttribute("data-proposal-unavailable", "true");
    expect(screen.getByTestId("assistant-route")).toHaveAttribute("data-proposal-id", "none");
  });
});
