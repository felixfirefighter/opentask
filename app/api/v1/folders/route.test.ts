import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

const mocks = vi.hoisted(() => ({
  actor: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  resolveActor: vi.fn(),
  getIdentityRequestSecurity: vi.fn(),
  getTasksApplication: vi.fn(),
  folders: {
    listFolders: vi.fn(),
    getFolder: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    positionFolder: vi.fn(),
    deleteFolder: vi.fn(),
    restoreFolder: vi.fn(),
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

import { POST as deleteFolder } from "./[folderId]/delete/route";
import { POST as positionFolder } from "./[folderId]/position/route";
import { POST as restoreFolder } from "./[folderId]/restore/route";
import { GET as getFolder, PATCH as updateFolder } from "./[folderId]/route";
import { GET as listFolders, POST as createFolder } from "./route";

const origin = "http://localhost:3000";
const folderId = "11111111-1111-4111-8111-111111111111";
const folder = {
  id: folderId,
  name: "Projects",
  rank: "a0",
  version: 1,
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
  deletedAt: null,
};

describe("folder route contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveActor.mockResolvedValue(mocks.actor);
    mocks.getIdentityRequestSecurity.mockReturnValue({ trustedOrigin: origin });
    mocks.getTasksApplication.mockReturnValue({ folders: mocks.folders });
    mocks.folders.listFolders.mockResolvedValue({ items: [folder], nextCursor: null });
    mocks.folders.getFolder.mockResolvedValue(folder);
    mocks.folders.createFolder.mockResolvedValue({ created: true, value: folder });
    mocks.folders.updateFolder.mockResolvedValue(folder);
    mocks.folders.positionFolder.mockResolvedValue(folder);
    mocks.folders.deleteFolder.mockResolvedValue(folder);
    mocks.folders.restoreFolder.mockResolvedValue(folder);
  });

  it("dispatches collection GET and idempotent POST through the authenticated application surface", async () => {
    const listed = await listFolders(new Request(`${origin}/api/v1/folders?limit=25`));
    expectPrivateJson(listed, 200);
    await expect(listed.json()).resolves.toEqual({ items: [folder], nextCursor: null });
    expect(mocks.folders.listFolders).toHaveBeenCalledWith(mocks.actor, { limit: 25 });

    const created = await createFolder(
      mutationRequest("/api/v1/folders", "POST", { name: "Projects" }, { "idempotency-key": folderId }),
    );
    expectPrivateJson(created, 201);
    expect(created.headers.get("location")).toBe(`/api/v1/folders/${folderId}`);
    expect(mocks.folders.createFolder).toHaveBeenCalledWith(mocks.actor, folderId, {
      name: "Projects",
      placement: { kind: "end" },
    });

    mocks.folders.createFolder.mockResolvedValueOnce({ created: false, value: folder });
    const replay = await createFolder(
      mutationRequest("/api/v1/folders", "POST", { name: "Projects" }, { "idempotency-key": folderId }),
    );
    expectPrivateJson(replay, 200);
    expect(replay.headers.get("location")).toBeNull();
    expect(mocks.resolveActor).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("dispatches every detail and lifecycle export with canonical path and body arguments", async () => {
    const context = folderContext(folderId);
    const detail = await getFolder(new Request(`${origin}/api/v1/folders/${folderId}`), context);
    expectPrivateJson(detail, 200);
    expect(mocks.folders.getFolder).toHaveBeenCalledWith(mocks.actor, folderId);

    const updated = await updateFolder(
      mutationRequest(`/api/v1/folders/${folderId}`, "PATCH", {
        expectedVersion: 1,
        patch: { name: "Work" },
      }),
      context,
    );
    expectPrivateJson(updated, 200);
    expect(mocks.folders.updateFolder).toHaveBeenCalledWith(mocks.actor, folderId, {
      expectedVersion: 1,
      patch: { name: "Work" },
    });

    const positioned = await positionFolder(
      mutationRequest(`/api/v1/folders/${folderId}/position`, "POST", {
        expectedVersion: 1,
        placement: { kind: "start" },
      }),
      context,
    );
    expectPrivateJson(positioned, 200);
    expect(mocks.folders.positionFolder).toHaveBeenCalledWith(mocks.actor, folderId, {
      expectedVersion: 1,
      placement: { kind: "start" },
    });

    const deleted = await deleteFolder(
      mutationRequest(`/api/v1/folders/${folderId}/delete`, "POST", { expectedVersion: 1 }),
      context,
    );
    const restored = await restoreFolder(
      mutationRequest(`/api/v1/folders/${folderId}/restore`, "POST", { expectedVersion: 2 }),
      context,
    );
    expectPrivateJson(deleted, 200);
    expectPrivateJson(restored, 200);
    expect(mocks.folders.deleteFolder).toHaveBeenCalledWith(mocks.actor, folderId, {
      expectedVersion: 1,
    });
    expect(mocks.folders.restoreFolder).toHaveBeenCalledWith(mocks.actor, folderId, {
      expectedVersion: 2,
    });
  });

  it("rejects undeclared query input on every non-collection handler", async () => {
    const query = `?userId=${mocks.actor.userId}`;
    const context = folderContext(folderId);
    const responses = [
      await createFolder(
        mutationRequest(
          `/api/v1/folders${query}`,
          "POST",
          { name: "Projects" },
          {
            "idempotency-key": folderId,
          },
        ),
      ),
      await getFolder(new Request(`${origin}/api/v1/folders/${folderId}${query}`), context),
      await updateFolder(
        mutationRequest(`/api/v1/folders/${folderId}${query}`, "PATCH", {
          expectedVersion: 1,
          patch: { name: "Work" },
        }),
        context,
      ),
      await positionFolder(
        mutationRequest(`/api/v1/folders/${folderId}/position${query}`, "POST", {
          expectedVersion: 1,
          placement: { kind: "end" },
        }),
        context,
      ),
      await deleteFolder(
        mutationRequest(`/api/v1/folders/${folderId}/delete${query}`, "POST", {
          expectedVersion: 1,
        }),
        context,
      ),
      await restoreFolder(
        mutationRequest(`/api/v1/folders/${folderId}/restore${query}`, "POST", {
          expectedVersion: 2,
        }),
        context,
      ),
    ];

    for (const response of responses) {
      await expectProblem(response, 400, "VALIDATION_FAILED");
    }
    expect(mocks.folders.createFolder).not.toHaveBeenCalled();
    expect(mocks.folders.getFolder).not.toHaveBeenCalled();
    expect(mocks.folders.updateFolder).not.toHaveBeenCalled();
    expect(mocks.folders.positionFolder).not.toHaveBeenCalled();
    expect(mocks.folders.deleteFolder).not.toHaveBeenCalled();
    expect(mocks.folders.restoreFolder).not.toHaveBeenCalled();
  });

  it("rejects invalid path, query, transport, oversized, and client-owned input before dispatch", async () => {
    await expectProblem(
      await getFolder(new Request(`${origin}/api/v1/folders/not-a-uuid`), folderContext("not-a-uuid")),
      400,
      "VALIDATION_FAILED",
    );
    await expectProblem(
      await listFolders(new Request(`${origin}/api/v1/folders?userId=${mocks.actor.userId}`)),
      400,
      "VALIDATION_FAILED",
    );

    for (const forbidden of ["userId", "rank", "kind", "deletedAt"] as const) {
      mocks.folders.createFolder.mockClear();
      await expectProblem(
        await createFolder(
          mutationRequest(
            "/api/v1/folders",
            "POST",
            { name: "Projects", [forbidden]: forbidden === "deletedAt" ? null : "client-value" },
            { "idempotency-key": folderId },
          ),
        ),
        400,
        "VALIDATION_FAILED",
      );
      expect(mocks.folders.createFolder).not.toHaveBeenCalled();
    }

    await expectProblem(
      await createFolder(mutationRequest("/api/v1/folders", "POST", { name: "Projects" })),
      400,
      "VALIDATION_FAILED",
    );
    expect(mocks.folders.createFolder).not.toHaveBeenCalled();

    mocks.resolveActor.mockClear();
    await expectProblem(
      await createFolder(
        mutationRequest(
          "/api/v1/folders",
          "POST",
          { name: "Projects" },
          { "content-type": "text/plain", "idempotency-key": folderId },
        ),
      ),
      400,
      "VALIDATION_FAILED",
    );
    expect(mocks.resolveActor).not.toHaveBeenCalled();

    await expectProblem(
      await createFolder(
        mutationRequest(
          "/api/v1/folders",
          "POST",
          { name: "Projects" },
          { origin: "https://attacker.example", "idempotency-key": folderId },
        ),
      ),
      403,
      "FORBIDDEN",
    );
    await expectProblem(
      await createFolder(
        mutationRequest(
          "/api/v1/folders",
          "POST",
          { name: "Projects" },
          { "idempotency-key": folderId, "sec-fetch-site": "cross-site" },
        ),
      ),
      403,
      "FORBIDDEN",
    );
    await expectProblem(
      await createFolder(
        mutationRequest(
          "/api/v1/folders",
          "POST",
          { name: "x".repeat(4_100) },
          { "idempotency-key": folderId },
        ),
      ),
      400,
      "VALIDATION_FAILED",
    );
    await expectProblem(
      await updateFolder(
        mutationRequest(`/api/v1/folders/${folderId}`, "POST", {
          expectedVersion: 1,
          patch: { name: "Wrong method" },
        }),
        folderContext(folderId),
      ),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("returns private authentication and stale-version problem envelopes", async () => {
    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("no session"), { code: "UNAUTHENTICATED" }),
    );
    await expectProblem(await listFolders(new Request(`${origin}/api/v1/folders`)), 401, "UNAUTHENTICATED");

    mocks.folders.updateFolder.mockRejectedValueOnce(
      new ApplicationError("CONFLICT", "The folder changed elsewhere.", { currentVersion: 7 }),
    );
    await expectProblem(
      await updateFolder(
        mutationRequest(`/api/v1/folders/${folderId}`, "PATCH", {
          expectedVersion: 1,
          patch: { name: "Stale" },
        }),
        folderContext(folderId),
      ),
      409,
      "CONFLICT",
      7,
    );
  });
});

function folderContext(id: string) {
  return { params: Promise.resolve({ folderId: id }) };
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
