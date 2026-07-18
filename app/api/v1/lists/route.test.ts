import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

const mocks = vi.hoisted(() => ({
  actor: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  resolveActor: vi.fn(),
  getIdentityRequestSecurity: vi.fn(),
  getTasksApplication: vi.fn(),
  lists: {
    listRegularLists: vi.fn(),
    getRegularList: vi.fn(),
    createRegularList: vi.fn(),
    updateRegularList: vi.fn(),
    moveRegularList: vi.fn(),
    deleteRegularList: vi.fn(),
    restoreRegularList: vi.fn(),
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

import { POST as deleteList } from "./[listId]/delete/route";
import { POST as moveList } from "./[listId]/move/route";
import { POST as restoreList } from "./[listId]/restore/route";
import { GET as getList, PATCH as updateList } from "./[listId]/route";
import { GET as listLists, POST as createList } from "./route";

const origin = "http://localhost:3000";
const listId = "22222222-2222-4222-8222-222222222222";
const destinationId = "33333333-3333-4333-8333-333333333333";
const list = {
  id: listId,
  folderId: null,
  name: "Launch",
  colorToken: "coral",
  rank: "a0",
  kind: "regular",
  version: 1,
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
  deletedAt: null,
};

describe("regular-list route contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveActor.mockResolvedValue(mocks.actor);
    mocks.getIdentityRequestSecurity.mockReturnValue({ trustedOrigin: origin });
    mocks.getTasksApplication.mockReturnValue({ lists: mocks.lists });
    mocks.lists.listRegularLists.mockResolvedValue({ items: [list], nextCursor: null });
    mocks.lists.getRegularList.mockResolvedValue(list);
    mocks.lists.createRegularList.mockResolvedValue({ created: true, value: list });
    mocks.lists.updateRegularList.mockResolvedValue(list);
    mocks.lists.moveRegularList.mockResolvedValue(list);
    mocks.lists.deleteRegularList.mockResolvedValue(list);
    mocks.lists.restoreRegularList.mockResolvedValue(list);
  });

  it("dispatches collection GET and idempotent POST with normalized application arguments", async () => {
    const listed = await listLists(new Request(`${origin}/api/v1/lists?limit=30`));
    expectPrivateJson(listed, 200);
    await expect(listed.json()).resolves.toEqual({ items: [list], nextCursor: null });
    expect(mocks.lists.listRegularLists).toHaveBeenCalledWith(mocks.actor, { limit: 30 });

    const created = await createList(
      mutationRequest(
        "/api/v1/lists",
        "POST",
        { name: "Launch", colorToken: "coral" },
        { "idempotency-key": listId },
      ),
    );
    expectPrivateJson(created, 201);
    expect(created.headers.get("location")).toBe(`/api/v1/lists/${listId}`);
    expect(mocks.lists.createRegularList).toHaveBeenCalledWith(mocks.actor, listId, {
      name: "Launch",
      colorToken: "coral",
      folderId: null,
      placement: { kind: "end" },
    });

    mocks.lists.createRegularList.mockResolvedValueOnce({ created: false, value: list });
    const replay = await createList(
      mutationRequest(
        "/api/v1/lists",
        "POST",
        { name: "Launch", colorToken: "coral" },
        { "idempotency-key": listId },
      ),
    );
    expectPrivateJson(replay, 200);
    expect(replay.headers.get("location")).toBeNull();
  });

  it("dispatches every detail and lifecycle export through the authenticated facade", async () => {
    const context = listContext(listId);
    const detail = await getList(new Request(`${origin}/api/v1/lists/${listId}`), context);
    expectPrivateJson(detail, 200);
    expect(mocks.lists.getRegularList).toHaveBeenCalledWith(mocks.actor, listId);

    const updated = await updateList(
      mutationRequest(`/api/v1/lists/${listId}`, "PATCH", {
        expectedVersion: 1,
        patch: { name: "Launch plan", colorToken: "sky" },
      }),
      context,
    );
    expectPrivateJson(updated, 200);
    expect(mocks.lists.updateRegularList).toHaveBeenCalledWith(mocks.actor, listId, {
      expectedVersion: 1,
      patch: { name: "Launch plan", colorToken: "sky" },
    });

    const moved = await moveList(
      mutationRequest(`/api/v1/lists/${listId}/move`, "POST", {
        expectedVersion: 1,
        folderId: null,
        placement: { kind: "end" },
      }),
      context,
    );
    expectPrivateJson(moved, 200);
    expect(mocks.lists.moveRegularList).toHaveBeenCalledWith(mocks.actor, listId, {
      expectedVersion: 1,
      folderId: null,
      placement: { kind: "end" },
    });

    const deleted = await deleteList(
      mutationRequest(`/api/v1/lists/${listId}/delete`, "POST", {
        expectedVersion: 2,
        moveTasksToListId: destinationId,
      }),
      context,
    );
    const restored = await restoreList(
      mutationRequest(`/api/v1/lists/${listId}/restore`, "POST", { expectedVersion: 3 }),
      context,
    );
    expectPrivateJson(deleted, 200);
    expectPrivateJson(restored, 200);
    expect(mocks.lists.deleteRegularList).toHaveBeenCalledWith(mocks.actor, listId, {
      expectedVersion: 2,
      moveTasksToListId: destinationId,
    });
    expect(mocks.lists.restoreRegularList).toHaveBeenCalledWith(mocks.actor, listId, {
      expectedVersion: 3,
    });
    expect(mocks.resolveActor).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("rejects undeclared query input on every non-collection handler", async () => {
    const query = `?userId=${mocks.actor.userId}`;
    const context = listContext(listId);
    const responses = [
      await createList(
        mutationRequest(
          `/api/v1/lists${query}`,
          "POST",
          { name: "Launch", colorToken: "coral" },
          { "idempotency-key": listId },
        ),
      ),
      await getList(new Request(`${origin}/api/v1/lists/${listId}${query}`), context),
      await updateList(
        mutationRequest(`/api/v1/lists/${listId}${query}`, "PATCH", {
          expectedVersion: 1,
          patch: { name: "Launch plan" },
        }),
        context,
      ),
      await moveList(
        mutationRequest(`/api/v1/lists/${listId}/move${query}`, "POST", {
          expectedVersion: 1,
          folderId: null,
          placement: { kind: "end" },
        }),
        context,
      ),
      await deleteList(
        mutationRequest(`/api/v1/lists/${listId}/delete${query}`, "POST", {
          expectedVersion: 2,
          moveTasksToListId: destinationId,
        }),
        context,
      ),
      await restoreList(
        mutationRequest(`/api/v1/lists/${listId}/restore${query}`, "POST", {
          expectedVersion: 3,
        }),
        context,
      ),
    ];

    for (const response of responses) {
      await expectProblem(response, 400, "VALIDATION_FAILED");
    }
    expect(mocks.lists.createRegularList).not.toHaveBeenCalled();
    expect(mocks.lists.getRegularList).not.toHaveBeenCalled();
    expect(mocks.lists.updateRegularList).not.toHaveBeenCalled();
    expect(mocks.lists.moveRegularList).not.toHaveBeenCalled();
    expect(mocks.lists.deleteRegularList).not.toHaveBeenCalled();
    expect(mocks.lists.restoreRegularList).not.toHaveBeenCalled();
  });

  it("rejects unknown query, malformed path, and client-owned list fields", async () => {
    await expectProblem(
      await listLists(new Request(`${origin}/api/v1/lists?kind=regular`)),
      400,
      "VALIDATION_FAILED",
    );
    await expectProblem(
      await getList(new Request(`${origin}/api/v1/lists/not-a-uuid`), listContext("not-a-uuid")),
      400,
      "VALIDATION_FAILED",
    );

    for (const forbidden of ["userId", "rank", "kind", "deletedAt"] as const) {
      mocks.lists.createRegularList.mockClear();
      await expectProblem(
        await createList(
          mutationRequest(
            "/api/v1/lists",
            "POST",
            {
              name: "Launch",
              colorToken: "coral",
              [forbidden]: forbidden === "deletedAt" ? null : "client-value",
            },
            { "idempotency-key": listId },
          ),
        ),
        400,
        "VALIDATION_FAILED",
      );
      expect(mocks.lists.createRegularList).not.toHaveBeenCalled();
    }

    await expectProblem(
      await createList(mutationRequest("/api/v1/lists", "POST", { name: "Launch", colorToken: "coral" })),
      400,
      "VALIDATION_FAILED",
    );
    expect(mocks.lists.createRegularList).not.toHaveBeenCalled();

    await expectProblem(
      await moveList(
        mutationRequest(`/api/v1/lists/${listId}/move`, "POST", {
          expectedVersion: 1,
          folderId: null,
          placement: { kind: "end" },
          rank: "client-rank",
        }),
        listContext(listId),
      ),
      400,
      "VALIDATION_FAILED",
    );
    expect(mocks.lists.moveRegularList).not.toHaveBeenCalled();
  });

  it("maps stale list mutations to a private conflict envelope", async () => {
    mocks.lists.deleteRegularList.mockRejectedValueOnce(
      new ApplicationError("CONFLICT", "The list changed elsewhere.", { currentVersion: 6 }),
    );
    await expectProblem(
      await deleteList(
        mutationRequest(`/api/v1/lists/${listId}/delete`, "POST", {
          expectedVersion: 1,
          moveTasksToListId: destinationId,
        }),
        listContext(listId),
      ),
      409,
      "CONFLICT",
      6,
    );
  });
});

function listContext(id: string) {
  return { params: Promise.resolve({ listId: id }) };
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
