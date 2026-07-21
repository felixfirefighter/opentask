import { afterEach, describe, expect, it, vi } from "vitest";

import {
  plannerInputFixture,
  plannerProposalFixture,
  proposalWithStatus,
} from "../planner-presentation-fixtures";
import {
  PlannerApiError,
  applyPlannerProposal,
  createPlannerProposal,
  getPlannerProposal,
  rejectPlannerProposal,
} from "./planner-api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("planner API client", () => {
  it("creates a proposal through the private same-origin JSON boundary", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(plannerProposalFixture, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPlannerProposal(plannerInputFixture)).resolves.toEqual(plannerProposalFixture);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, request] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/v1/planner/proposals");
    expect(request).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(String(request?.body))).toEqual(plannerInputFixture);
    expect(new Headers(request?.headers).get("content-type")).toBe("application/json");
  });

  it("reads and rejects the exact owned proposal resource", async () => {
    const rejected = proposalWithStatus("rejected");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(plannerProposalFixture))
      .mockResolvedValueOnce(jsonResponse(rejected));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPlannerProposal(plannerProposalFixture.id)).resolves.toEqual(plannerProposalFixture);
    await expect(rejectPlannerProposal(plannerProposalFixture.id)).resolves.toEqual(rejected);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/planner/proposals/${plannerProposalFixture.id}`);
    const [rejectPath, rejectRequest] = fetchMock.mock.calls[1]!;
    expect(rejectPath).toBe(`/api/v1/planner/proposals/${plannerProposalFixture.id}/reject`);
    expect(rejectRequest?.method).toBe("POST");
    expect(rejectRequest?.body).toBe("{}");
  });

  it("sends the apply token as the idempotency key and validates the atomic result", async () => {
    const result = {
      proposalId: plannerProposalFixture.id,
      outcome: "applied" as const,
      appliedActionCount: 4,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(result));
    vi.stubGlobal("fetch", fetchMock);
    const selection = {
      proposalId: plannerProposalFixture.id,
      applyToken: plannerProposalFixture.applyToken,
      actions: plannerProposalFixture.proposal.actions.slice(0, 4),
    };

    await expect(applyPlannerProposal(selection)).resolves.toEqual(result);

    const [path, request] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/v1/planner/proposals/${plannerProposalFixture.id}/apply`);
    expect(new Headers(request?.headers).get("idempotency-key")).toBe(plannerProposalFixture.applyToken);
    expect(JSON.parse(String(request?.body))).toEqual(selection);
  });

  it("maps a problem envelope without exposing its detail through the client error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          type: "urn:omplish:problem:conflict",
          title: "Conflict",
          status: 409,
          code: "CONFLICT",
          detail: "Private task title must not escape",
          correlationId: "safe-correlation-id",
          currentVersion: 7,
        },
        409,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await applyPlannerProposal({
      proposalId: plannerProposalFixture.id,
      applyToken: plannerProposalFixture.applyToken,
      actions: [],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlannerApiError);
    expect(error).toMatchObject({ code: "CONFLICT", status: 409, currentVersion: 7 });
    expect((error as Error).message).not.toContain("Private task title");
  });

  it("fails closed for malformed success responses and network failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: plannerProposalFixture.id }))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPlannerProposal(plannerInputFixture)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(createPlannerProposal(plannerInputFixture)).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("rejects invalid local input before fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPlannerProposal("not-a-proposal-id")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
