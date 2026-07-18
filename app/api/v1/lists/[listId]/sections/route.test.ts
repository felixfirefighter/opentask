import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

const mocks = vi.hoisted(() => ({
  actor: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  resolveActor: vi.fn(),
  getIdentityRequestSecurity: vi.fn(),
  getTasksApplication: vi.fn(),
  sections: {
    listSections: vi.fn(),
    getSection: vi.fn(),
    createSection: vi.fn(),
    updateSection: vi.fn(),
    positionSection: vi.fn(),
    deleteSection: vi.fn(),
  },
}));

vi.mock("@/modules/identity", () => ({
  resolveActor: mocks.resolveActor,
  getIdentityRequestSecurity: mocks.getIdentityRequestSecurity,
}));

vi.mock("@/modules/tasks", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return { ...original, getTasksApplication: mocks.getTasksApplication };
});

import { POST as deleteSection } from "./[sectionId]/delete/route";
import { POST as positionSection } from "./[sectionId]/position/route";
import { GET as getSection, PATCH as updateSection } from "./[sectionId]/route";
import { GET as listSections, POST as createSection } from "./route";

const origin = "http://localhost:3000";
const listId = "22222222-2222-4222-8222-222222222222";
const sectionId = "44444444-4444-4444-8444-444444444444";
const section = {
  id: sectionId,
  listId,
  name: "In progress",
  rank: "a0",
  version: 1,
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
};

describe("section route contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveActor.mockResolvedValue(mocks.actor);
    mocks.getIdentityRequestSecurity.mockReturnValue({ trustedOrigin: origin });
    mocks.getTasksApplication.mockReturnValue({ sections: mocks.sections });
    mocks.sections.listSections.mockResolvedValue({ items: [section], nextCursor: null });
    mocks.sections.getSection.mockResolvedValue(section);
    mocks.sections.createSection.mockResolvedValue({ created: true, value: section });
    mocks.sections.updateSection.mockResolvedValue(section);
    mocks.sections.positionSection.mockResolvedValue(section);
    mocks.sections.deleteSection.mockResolvedValue(section);
  });

  it("dispatches collection GET and idempotent POST with both scoped identifiers", async () => {
    const listed = await listSections(
      new Request(`${origin}/api/v1/lists/${listId}/sections?limit=10`),
      listContext(listId),
    );
    expectPrivateJson(listed, 200);
    await expect(listed.json()).resolves.toEqual({ items: [section], nextCursor: null });
    expect(mocks.sections.listSections).toHaveBeenCalledWith(mocks.actor, listId, { limit: 10 });

    const created = await createSection(
      mutationRequest(
        `/api/v1/lists/${listId}/sections`,
        "POST",
        { name: "In progress" },
        {
          "idempotency-key": sectionId,
        },
      ),
      listContext(listId),
    );
    expectPrivateJson(created, 201);
    expect(created.headers.get("location")).toBe(`/api/v1/lists/${listId}/sections/${sectionId}`);
    expect(mocks.sections.createSection).toHaveBeenCalledWith(mocks.actor, listId, sectionId, {
      name: "In progress",
      placement: { kind: "end" },
    });

    mocks.sections.createSection.mockResolvedValueOnce({ created: false, value: section });
    const replay = await createSection(
      mutationRequest(
        `/api/v1/lists/${listId}/sections`,
        "POST",
        { name: "In progress" },
        {
          "idempotency-key": sectionId,
        },
      ),
      listContext(listId),
    );
    expectPrivateJson(replay, 200);
    expect(replay.headers.get("location")).toBeNull();
  });

  it("dispatches every nested detail and lifecycle export with canonical arguments", async () => {
    const context = sectionContext(listId, sectionId);
    const detail = await getSection(
      new Request(`${origin}/api/v1/lists/${listId}/sections/${sectionId}`),
      context,
    );
    expectPrivateJson(detail, 200);
    expect(mocks.sections.getSection).toHaveBeenCalledWith(mocks.actor, listId, sectionId);

    const updated = await updateSection(
      mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}`, "PATCH", {
        expectedVersion: 1,
        patch: { name: "Doing" },
      }),
      context,
    );
    expectPrivateJson(updated, 200);
    expect(mocks.sections.updateSection).toHaveBeenCalledWith(mocks.actor, listId, sectionId, {
      expectedVersion: 1,
      patch: { name: "Doing" },
    });

    const positioned = await positionSection(
      mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}/position`, "POST", {
        expectedVersion: 1,
        placement: { kind: "before", anchorId: "55555555-5555-4555-8555-555555555555" },
      }),
      context,
    );
    expectPrivateJson(positioned, 200);
    expect(mocks.sections.positionSection).toHaveBeenCalledWith(mocks.actor, listId, sectionId, {
      expectedVersion: 1,
      placement: { kind: "before", anchorId: "55555555-5555-4555-8555-555555555555" },
    });

    const deleted = await deleteSection(
      mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}/delete`, "POST", {
        expectedVersion: 2,
      }),
      context,
    );
    expectPrivateJson(deleted, 200);
    expect(mocks.sections.deleteSection).toHaveBeenCalledWith(mocks.actor, listId, sectionId, {
      expectedVersion: 2,
    });
    expect(mocks.resolveActor).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("rejects undeclared query input on every non-collection handler", async () => {
    const query = `?userId=${mocks.actor.userId}`;
    const parentContext = listContext(listId);
    const detailContext = sectionContext(listId, sectionId);
    const responses = [
      await createSection(
        mutationRequest(
          `/api/v1/lists/${listId}/sections${query}`,
          "POST",
          { name: "In progress" },
          { "idempotency-key": sectionId },
        ),
        parentContext,
      ),
      await getSection(
        new Request(`${origin}/api/v1/lists/${listId}/sections/${sectionId}${query}`),
        detailContext,
      ),
      await updateSection(
        mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}${query}`, "PATCH", {
          expectedVersion: 1,
          patch: { name: "Doing" },
        }),
        detailContext,
      ),
      await positionSection(
        mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}/position${query}`, "POST", {
          expectedVersion: 1,
          placement: { kind: "end" },
        }),
        detailContext,
      ),
      await deleteSection(
        mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}/delete${query}`, "POST", {
          expectedVersion: 2,
        }),
        detailContext,
      ),
    ];

    for (const response of responses) {
      await expectProblem(response, 400, "VALIDATION_FAILED");
    }
    expect(mocks.sections.createSection).not.toHaveBeenCalled();
    expect(mocks.sections.getSection).not.toHaveBeenCalled();
    expect(mocks.sections.updateSection).not.toHaveBeenCalled();
    expect(mocks.sections.positionSection).not.toHaveBeenCalled();
    expect(mocks.sections.deleteSection).not.toHaveBeenCalled();
  });

  it("rejects unknown query, malformed nested paths, and client-owned section fields", async () => {
    await expectProblem(
      await listSections(
        new Request(`${origin}/api/v1/lists/${listId}/sections?rank=a0`),
        listContext(listId),
      ),
      400,
      "VALIDATION_FAILED",
    );
    await expectProblem(
      await listSections(
        new Request(`${origin}/api/v1/lists/not-a-uuid/sections`),
        listContext("not-a-uuid"),
      ),
      400,
      "VALIDATION_FAILED",
    );
    await expectProblem(
      await getSection(
        new Request(`${origin}/api/v1/lists/${listId}/sections/not-a-uuid`),
        sectionContext(listId, "not-a-uuid"),
      ),
      400,
      "VALIDATION_FAILED",
    );

    for (const forbidden of ["userId", "rank", "kind", "deletedAt"] as const) {
      mocks.sections.createSection.mockClear();
      await expectProblem(
        await createSection(
          mutationRequest(
            `/api/v1/lists/${listId}/sections`,
            "POST",
            { name: "In progress", [forbidden]: forbidden === "deletedAt" ? null : "client-value" },
            { "idempotency-key": sectionId },
          ),
          listContext(listId),
        ),
        400,
        "VALIDATION_FAILED",
      );
      expect(mocks.sections.createSection).not.toHaveBeenCalled();
    }

    await expectProblem(
      await createSection(
        mutationRequest(`/api/v1/lists/${listId}/sections`, "POST", { name: "In progress" }),
        listContext(listId),
      ),
      400,
      "VALIDATION_FAILED",
    );
    expect(mocks.sections.createSection).not.toHaveBeenCalled();

    await expectProblem(
      await positionSection(
        mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}/position`, "POST", {
          expectedVersion: 1,
          placement: { kind: "end" },
          rank: "client-rank",
        }),
        sectionContext(listId, sectionId),
      ),
      400,
      "VALIDATION_FAILED",
    );
    expect(mocks.sections.positionSection).not.toHaveBeenCalled();
  });

  it("maps a stale nested mutation to a private conflict envelope", async () => {
    mocks.sections.updateSection.mockRejectedValueOnce(
      new ApplicationError("CONFLICT", "The section changed elsewhere.", { currentVersion: 5 }),
    );
    await expectProblem(
      await updateSection(
        mutationRequest(`/api/v1/lists/${listId}/sections/${sectionId}`, "PATCH", {
          expectedVersion: 1,
          patch: { name: "Stale" },
        }),
        sectionContext(listId, sectionId),
      ),
      409,
      "CONFLICT",
      5,
    );
  });
});

function listContext(id: string) {
  return { params: Promise.resolve({ listId: id }) };
}

function sectionContext(parentId: string, id: string) {
  return { params: Promise.resolve({ listId: parentId, sectionId: id }) };
}

function mutationRequest(
  path: string,
  method: "PATCH" | "POST",
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function expectPrivateJson(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toContain("application/json");
}

async function expectProblem(response: Response, status: number, code: string, currentVersion?: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  await expect(response.json()).resolves.toMatchObject({
    status,
    code,
    correlationId: expect.any(String),
    ...(currentVersion === undefined ? {} : { currentVersion }),
  });
}
