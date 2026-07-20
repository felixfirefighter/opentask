import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLANNER_MODEL, PLANNER_SCHEMA_VERSION } from "../application/contracts";
import { AssistantPlannerRouteScreen } from "./AssistantPlannerRouteScreen";
import {
  plannerInputFixture,
  plannerProposalFixture,
  plannerTasksFixture,
  proposalWithStatus,
} from "./planner-presentation-fixtures";

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setOnline(true);
});

describe("Assistant planner route controller", () => {
  it("drives Describe through an honest processing state into Review", async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderRoute();

    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    expect(screen.getByRole("heading", { name: "Building a reviewable plan" })).toBeInTheDocument();
    expect(screen.getByText("No task changes while the proposal is being prepared.")).toBeInTheDocument();

    await act(async () => resolveRequest?.(jsonResponse(plannerProposalFixture, 201)));
    expect(await screen.findByRole("heading", { name: "Proposal changes" })).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(navigation.replace).toHaveBeenCalledWith(`/plan?proposal=${plannerProposalFixture.id}`, {
      scroll: false,
    });
  });

  it("restores an authorized pending Review and an honest terminal Result without a client fetch", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const pending = renderRoute({ initialProposal: plannerProposalFixture });
    expect(screen.getByRole("heading", { name: "Proposal changes" })).toHaveFocus();
    expect(screen.getByText("Review")).toHaveAttribute("aria-current", "step");
    pending.unmount();

    renderRoute({ initialProposal: proposalWithStatus("applied") });
    expect(screen.getByRole("heading", { name: "This proposal was already applied" })).toHaveFocus();
    expect(screen.getByText("Result")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the persisted proposal URL when starting a new proposal", async () => {
    const user = userEvent.setup();
    renderRoute({ initialProposal: proposalWithStatus("applied") });

    await user.click(screen.getByRole("button", { name: "Create new proposal" }));

    expect(screen.getByRole("button", { name: "Create proposal" })).toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith("/plan", { scroll: false });
  });

  it("applies the reviewed selection once and reports the exact atomic result", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(plannerProposalFixture, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          proposalId: plannerProposalFixture.id,
          outcome: "applied",
          appliedActionCount: 4,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { queryClient } = renderRoute();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    await screen.findByRole("heading", { name: "Proposal changes" });
    await user.click(screen.getByRole("button", { name: "Apply 5 changes" }));

    expect(await screen.findByRole("heading", { name: "Your selected changes were applied" })).toHaveFocus();
    expect(screen.getByText("4 actions were committed together.")).toBeInTheDocument();
    expect(screen.getByText("Not applied").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: "Prepare organized attendee notes" })).toHaveAttribute(
      "href",
      `/tasks/${plannerTasksFixture[1]!.id}?returnTo=%2Fplan%3Fproposal%3D${plannerProposalFixture.id}`,
    );
    const [, applyRequest] = fetchMock.mock.calls[1]!;
    expect(new Headers(applyRequest?.headers).get("idempotency-key")).toBe(plannerProposalFixture.applyToken);
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("retries generation with the current visible draft", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(problemResponse("INTERNAL", 500))
      .mockResolvedValueOnce(jsonResponse(plannerProposalFixture, 201));
    vi.stubGlobal("fetch", fetchMock);
    renderRoute();

    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    await screen.findByRole("alert");
    const input = screen.getByRole("textbox", { name: /Brain dump/u });
    await user.clear(input);
    await user.type(input, "Use the currently visible retry draft.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Proposal changes" });

    const [, request] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(request?.body))).toMatchObject({
      brainDump: "Use the currently visible retry draft.",
    });
  });

  it("turns an apply conflict into a blocked stale review and regenerates on Retry", async () => {
    const user = userEvent.setup();
    const regenerated = {
      ...plannerProposalFixture,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      applyToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(plannerProposalFixture, 201))
      .mockResolvedValueOnce(problemResponse("CONFLICT", 409))
      .mockResolvedValueOnce(jsonResponse(regenerated, 201));
    vi.stubGlobal("fetch", fetchMock);
    renderRoute();

    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    await screen.findByRole("heading", { name: "Proposal changes" });
    await user.click(screen.getByRole("button", { name: "Apply 5 changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This proposal is out of date");
    expect(screen.getByRole("button", { name: "Apply 0 changes" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Proposal changes" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/planner/proposals");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST");
  });

  it("never regenerates a restored stale proposal from an unpersisted blank input", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(problemResponse("CONFLICT", 409));
    vi.stubGlobal("fetch", fetchMock);
    renderRoute({
      initialInput: { ...plannerInputFixture, brainDump: "", selectedTaskIds: [] },
      initialProposal: plannerProposalFixture,
    });

    await user.click(screen.getByRole("button", { name: "Apply 5 changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This proposal is out of date");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The selected context changed");
    expect(screen.getByRole("textbox", { name: /Brain dump/u })).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(navigation.replace).toHaveBeenCalledWith("/plan", { scroll: false });
  });

  it("treats a lost apply response as unknown until status is refreshed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(plannerProposalFixture, 201))
      .mockRejectedValueOnce(new TypeError("connection lost after send"))
      .mockResolvedValueOnce(jsonResponse(proposalWithStatus("applied")));
    vi.stubGlobal("fetch", fetchMock);
    renderRoute();

    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    await screen.findByRole("heading", { name: "Proposal changes" });
    await user.click(screen.getByRole("button", { name: "Apply 5 changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("apply result could not be confirmed");
    expect(screen.queryByText("No changes were applied")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "This proposal was already applied" })).toHaveFocus();
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/v1/planner/proposals/${plannerProposalFixture.id}`);
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
  });

  it("rejects explicitly and renders the persisted terminal state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(plannerProposalFixture, 201))
      .mockResolvedValueOnce(jsonResponse(proposalWithStatus("rejected")));
    vi.stubGlobal("fetch", fetchMock);
    renderRoute();

    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    await screen.findByRole("heading", { name: "Proposal changes" });
    await user.click(screen.getByRole("button", { name: "Reject proposal" }));

    expect(await screen.findByRole("heading", { name: "This proposal was rejected" })).toHaveFocus();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/v1/planner/proposals/${plannerProposalFixture.id}/reject`,
    );
  });

  it("uses permission-safe and offline states without leaking or sending input", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(problemResponse("FORBIDDEN", 403));
    vi.stubGlobal("fetch", fetchMock);
    const first = renderRoute();

    await user.click(screen.getByRole("button", { name: "Create proposal" }));
    expect(
      await screen.findByRole("heading", { name: "This planning proposal is unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(plannerInputFixture.brainDump)).not.toBeInTheDocument();

    first.unmount();
    setOnline(false);
    renderRoute();
    expect(screen.getByRole("button", { name: "Create proposal" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Planner actions are unavailable offline");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

function renderRoute(overrides: Partial<React.ComponentProps<typeof AssistantPlannerRouteScreen>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AssistantPlannerRouteScreen
        capability={{ state: "available", model: PLANNER_MODEL, schemaVersion: PLANNER_SCHEMA_VERSION }}
        initialInput={plannerInputFixture}
        tasks={plannerTasksFixture}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function problemResponse(code: "CONFLICT" | "FORBIDDEN" | "INTERNAL", status: number) {
  return jsonResponse(
    {
      type: `urn:opentask:problem:${code.toLowerCase()}`,
      title: code === "CONFLICT" ? "Conflict" : "Access denied",
      status,
      code,
      detail: "A private server detail",
      correlationId: "safe-correlation-id",
    },
    status,
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}
