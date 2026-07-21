import type * as AssistantModule from "@/modules/assistant";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getApplication: vi.fn(),
  getReleaseApplications: vi.fn(),
  application: {
    capability: vi.fn(),
    createProposal: vi.fn(),
    getProposal: vi.fn(),
    rejectProposal: vi.fn(),
    applyProposal: vi.fn(),
  },
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));
vi.mock("@/modules/assistant", async (importOriginal) => ({
  ...(await importOriginal<typeof AssistantModule>()),
  getAssistantPlannerApplication: mocks.getApplication,
}));
vi.mock("@/server/release-applications", () => ({
  getReleaseApplications: mocks.getReleaseApplications,
}));

import { GET as getCapability } from "./capability/route";
import { POST as createProposal } from "./proposals/route";
import { POST as applyProposal } from "./proposals/[proposalId]/apply/route";
import { POST as rejectProposal } from "./proposals/[proposalId]/reject/route";
import { GET as getProposal } from "./proposals/[proposalId]/route";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };
const proposalId = "22222222-2222-4222-8222-222222222222";
const applyToken = "33333333-3333-4333-8333-333333333333";
const plannerInput = {
  brainDump: "Prepare the demo",
  selectedTaskIds: [],
  planningDate: "2026-07-20",
  timeZone: "Asia/Singapore",
  workWindow: { start: "09:00", end: "17:00" },
  defaultDurationMinutes: 30,
  bufferMinutes: 10,
};
const selection = { proposalId, applyToken, actions: [] };

function context(value = proposalId) {
  return { params: Promise.resolve({ proposalId: value }) };
}

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("planner API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getApplication.mockReturnValue(mocks.application);
    mocks.getReleaseApplications.mockReturnValue({ assistant: mocks.application });
    mocks.application.capability.mockReturnValue({ state: "disabled", reason: "missing_api_key" });
    mocks.application.createProposal.mockResolvedValue({ id: proposalId });
    mocks.application.getProposal.mockResolvedValue({ id: proposalId, status: "pending" });
    mocks.application.rejectProposal.mockResolvedValue({ id: proposalId, status: "rejected" });
    mocks.application.applyProposal.mockResolvedValue({
      proposalId,
      outcome: "applied",
      appliedActionCount: 0,
    });
  });

  it("authenticates and serves the no-key capability without exposing configuration", async () => {
    const response = await getCapability(new Request("http://localhost:3000/api/v1/planner/capability"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ state: "disabled", reason: "missing_api_key" });
    expect(mocks.application.capability).toHaveBeenCalledOnce();
  });

  it("creates, reads, rejects, and explicitly applies one owned proposal", async () => {
    const created = await createProposal(jsonRequest("/api/v1/planner/proposals", plannerInput));
    expect(created.status).toBe(201);
    expect(created.headers.get("location")).toBe(`/api/v1/planner/proposals/${proposalId}`);
    expect(mocks.application.createProposal).toHaveBeenCalledWith(actor, plannerInput);

    const read = await getProposal(
      new Request(`http://localhost:3000/api/v1/planner/proposals/${proposalId}`),
      context(),
    );
    expect(read.status).toBe(200);
    expect(mocks.application.getProposal).toHaveBeenCalledWith(actor, proposalId);

    const rejected = await rejectProposal(
      jsonRequest(`/api/v1/planner/proposals/${proposalId}/reject`, {}),
      context(),
    );
    expect(rejected.status).toBe(200);
    expect(mocks.application.rejectProposal).toHaveBeenCalledWith(actor, proposalId);

    const applied = await applyProposal(
      jsonRequest(`/api/v1/planner/proposals/${proposalId}/apply`, selection, {
        "idempotency-key": applyToken,
      }),
      context(),
    );
    expect(applied.status).toBe(200);
    expect(mocks.application.applyProposal).toHaveBeenCalledWith(actor, proposalId, selection);
  });

  it("rejects a missing, malformed, or mismatched apply idempotency key before dispatch", async () => {
    const requests = [
      jsonRequest(`/api/v1/planner/proposals/${proposalId}/apply`, selection),
      jsonRequest(`/api/v1/planner/proposals/${proposalId}/apply`, selection, {
        "idempotency-key": "not-a-uuid",
      }),
      jsonRequest(`/api/v1/planner/proposals/${proposalId}/apply`, selection, {
        "idempotency-key": "44444444-4444-4444-8444-444444444444",
      }),
    ];
    for (const request of requests) {
      const response = await applyProposal(request, context());
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.application.applyProposal).not.toHaveBeenCalled();
  });

  it("rejects cross-site writes, unknown fields, queries, and unavailable sessions safely", async () => {
    const crossSite = jsonRequest("/api/v1/planner/proposals", plannerInput, {
      origin: "https://attacker.invalid",
      "sec-fetch-site": "cross-site",
    });
    expect((await createProposal(crossSite)).status).toBe(403);
    expect(
      (
        await createProposal(
          jsonRequest("/api/v1/planner/proposals", { ...plannerInput, userId: actor.userId }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await getProposal(
          new Request(`http://localhost:3000/api/v1/planner/proposals/${proposalId}?secret=1`),
          context(),
        )
      ).status,
    ).toBe(400);

    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("private"), { code: "UNAUTHENTICATED" }),
    );
    const unauthenticated = await getCapability(
      new Request("http://localhost:3000/api/v1/planner/capability"),
    );
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.text()).not.toContain("private");
  });
});
