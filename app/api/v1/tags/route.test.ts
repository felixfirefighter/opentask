import type * as TasksModule from "@/modules/tasks";
import { ApplicationError } from "@/shared/http/application-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getTasksApplication: vi.fn(),
  tags: {
    listTags: vi.fn(),
    getTag: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    restoreTag: vi.fn(),
  },
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof TasksModule>()),
  getTasksApplication: mocks.getTasksApplication,
}));

import { GET as getTag, PATCH as patchTag } from "./[tagId]/route";
import { POST as deleteTag } from "./[tagId]/delete/route";
import { POST as restoreTag } from "./[tagId]/restore/route";
import { GET as listTags, POST as createTag } from "./route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const tagId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const upperTagId = tagId.toUpperCase();
const now = "2026-07-19T01:02:03.000Z";
const tagValue = {
  id: tagId,
  name: "Launch",
  colorToken: "coral",
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

function context(value = upperTagId) {
  return { params: Promise.resolve({ tagId: value }) };
}

function jsonMutation(
  path: string,
  body: unknown,
  method: "PATCH" | "POST" = "POST",
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function mutationCases() {
  return [
    {
      name: "tag create",
      invoke: (request: Request) => createTag(request),
      operation: mocks.tags.createTag,
      request: (headers: Record<string, string> = {}) =>
        jsonMutation("/api/v1/tags", { name: "Launch", colorToken: "coral" }, "POST", {
          "idempotency-key": tagId,
          ...headers,
        }),
    },
    {
      name: "tag update",
      invoke: (request: Request) => patchTag(request, context()),
      operation: mocks.tags.updateTag,
      request: (headers: Record<string, string> = {}) =>
        jsonMutation(
          `/api/v1/tags/${tagId}`,
          { expectedVersion: 1, patch: { name: "Renamed" } },
          "PATCH",
          headers,
        ),
    },
    {
      name: "tag delete",
      invoke: (request: Request) => deleteTag(request, context()),
      operation: mocks.tags.deleteTag,
      request: (headers: Record<string, string> = {}) =>
        jsonMutation(`/api/v1/tags/${tagId}/delete`, { expectedVersion: 1 }, "POST", headers),
    },
    {
      name: "tag restore",
      invoke: (request: Request) => restoreTag(request, context()),
      operation: mocks.tags.restoreTag,
      request: (headers: Record<string, string> = {}) =>
        jsonMutation(`/api/v1/tags/${tagId}/restore`, { expectedVersion: 1 }, "POST", headers),
    },
  ] as const;
}

describe("tag API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getTasksApplication.mockReturnValue({ tags: mocks.tags });
    mocks.tags.listTags.mockResolvedValue({ items: [tagValue], nextCursor: null });
    mocks.tags.getTag.mockResolvedValue(tagValue);
    mocks.tags.createTag.mockResolvedValue({ created: true, value: tagValue });
    mocks.tags.updateTag.mockResolvedValue({ ...tagValue, version: 2 });
    mocks.tags.deleteTag.mockResolvedValue({ ...tagValue, version: 2, deletedAt: now });
    mocks.tags.restoreTag.mockResolvedValue({ ...tagValue, version: 2 });
  });

  it("lists an authenticated strict page with private caching", async () => {
    const response = await listTags(new Request("http://localhost:3000/api/v1/tags?limit=10"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [tagValue], nextCursor: null });
    expect(mocks.tags.listTags).toHaveBeenCalledWith(actor, { limit: 10 });
  });

  it("rejects duplicate and unknown collection query values before the application call", async () => {
    for (const query of ["limit=10&limit=20", "unexpected=1"]) {
      const response = await listTags(new Request(`http://localhost:3000/api/v1/tags?${query}`));
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.tags.listTags).not.toHaveBeenCalled();
  });

  it("rejects query parameters on endpoints without a query contract", async () => {
    const detail = await getTag(
      new Request(`http://localhost:3000/api/v1/tags/${tagId}?unexpected=1`),
      context(),
    );
    const create = await createTag(
      jsonMutation("/api/v1/tags?unexpected=1", { name: "Launch", colorToken: "coral" }, "POST", {
        "idempotency-key": tagId,
      }),
    );

    expect(detail.status).toBe(400);
    expect(create.status).toBe(400);
    expect(mocks.tags.getTag).not.toHaveBeenCalled();
    expect(mocks.tags.createTag).not.toHaveBeenCalled();
  });

  it("returns 201 with Location for first create and 200 without Location for replay", async () => {
    const first = await createTag(
      jsonMutation("/api/v1/tags", { name: "Launch", colorToken: "coral" }, "POST", {
        "idempotency-key": upperTagId,
      }),
    );
    expect(first.status).toBe(201);
    expect(first.headers.get("location")).toBe(`/api/v1/tags/${tagId}`);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(mocks.tags.createTag).toHaveBeenCalledWith(actor, tagId, {
      name: "Launch",
      colorToken: "coral",
    });

    mocks.tags.createTag.mockResolvedValueOnce({ created: false, value: tagValue });
    const replay = await createTag(
      jsonMutation("/api/v1/tags", { name: "Launch", colorToken: "coral" }, "POST", {
        "idempotency-key": tagId,
      }),
    );
    expect(replay.status).toBe(200);
    expect(replay.headers.get("location")).toBeNull();
  });

  it("gets and patches a strict UUID path through the authenticated actor", async () => {
    const getResponse = await getTag(
      new Request(`http://localhost:3000/api/v1/tags/${upperTagId}`),
      context(),
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("cache-control")).toBe("no-store");
    expect(mocks.tags.getTag).toHaveBeenCalledWith(actor, tagId);

    const patchResponse = await patchTag(
      jsonMutation(`/api/v1/tags/${tagId}`, { expectedVersion: 1, patch: { colorToken: "sky" } }, "PATCH"),
      context(),
    );
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.headers.get("cache-control")).toBe("no-store");
    expect(mocks.tags.updateTag).toHaveBeenCalledWith(actor, tagId, {
      expectedVersion: 1,
      patch: { colorToken: "sky" },
    });
  });

  it("maps invalid paths and stale conflicts to stable private problems", async () => {
    const invalidPath = await getTag(
      new Request("http://localhost:3000/api/v1/tags/not-a-uuid"),
      context("not-a-uuid"),
    );
    expect(invalidPath.status).toBe(400);
    expect(mocks.tags.getTag).not.toHaveBeenCalled();

    mocks.tags.updateTag.mockRejectedValueOnce(
      new ApplicationError("CONFLICT", "This record changed elsewhere.", { currentVersion: 4 }),
    );
    const conflict = await patchTag(
      jsonMutation(`/api/v1/tags/${tagId}`, { expectedVersion: 1, patch: { name: "Renamed" } }, "PATCH"),
      context(),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get("cache-control")).toBe("no-store");
    await expect(conflict.json()).resolves.toMatchObject({
      type: "urn:opentask:problem:conflict",
      code: "CONFLICT",
      currentVersion: 4,
    });
  });

  it("returns active lifecycle DTOs from delete and restore POST actions", async () => {
    const deleted = await deleteTag(
      jsonMutation(`/api/v1/tags/${tagId}/delete`, { expectedVersion: 1 }),
      context(),
    );
    expect(deleted.status).toBe(200);
    expect(deleted.headers.get("cache-control")).toBe("no-store");
    expect(mocks.tags.deleteTag).toHaveBeenCalledWith(actor, tagId, { expectedVersion: 1 });

    const restored = await restoreTag(
      jsonMutation(`/api/v1/tags/${tagId}/restore`, { expectedVersion: 1 }),
      context(),
    );
    expect(restored.status).toBe(200);
    expect(restored.headers.get("cache-control")).toBe("no-store");
    expect(mocks.tags.restoreTag).toHaveBeenCalledWith(actor, tagId, { expectedVersion: 1 });
  });

  it("enforces same-origin, JSON, authentication, and 4KiB limits on every mutation", async () => {
    for (const testCase of mutationCases()) {
      const crossOrigin = await testCase.invoke(testCase.request({ origin: "https://attacker.invalid" }));
      expect(crossOrigin.status, `${testCase.name} origin`).toBe(403);

      const nonJson = await testCase.invoke(testCase.request({ "content-type": "text/plain" }));
      expect(nonJson.status, `${testCase.name} content type`).toBe(400);

      const oversized = await testCase.invoke(testCase.request({ "content-length": "4097" }));
      expect(oversized.status, `${testCase.name} body limit`).toBe(400);

      expect(testCase.operation).not.toHaveBeenCalled();
    }

    mocks.resolveActor.mockRejectedValue(Object.assign(new Error("no session"), { code: "UNAUTHENTICATED" }));
    for (const testCase of mutationCases()) {
      const unauthenticated = await testCase.invoke(testCase.request());
      expect(unauthenticated.status, `${testCase.name} authentication`).toBe(401);
      expect(unauthenticated.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("requires UUIDv4 create keys and the PATCH method contract", async () => {
    const missingKey = await createTag(jsonMutation("/api/v1/tags", { name: "Launch", colorToken: "coral" }));
    expect(missingKey.status).toBe(400);
    expect(mocks.tags.createTag).not.toHaveBeenCalled();

    const wrongMethod = await patchTag(
      jsonMutation(`/api/v1/tags/${tagId}`, { expectedVersion: 1, patch: { name: "Renamed" } }),
      context(),
    );
    expect(wrongMethod.status).toBe(400);
    expect(mocks.tags.updateTag).not.toHaveBeenCalled();
  });
});
