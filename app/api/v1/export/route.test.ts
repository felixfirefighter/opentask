import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  exportUserData: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({ resolveActor: mocks.resolveActor }));
vi.mock("@/modules/portability", () => ({
  buildUserExportFilename: () => "omplish-export-2026-07-19.json",
  getPortabilityApplication: () => ({ exportUserData: mocks.exportUserData }),
}));

import { GET } from "./route";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };
const envelope = { schemaVersion: 1, exportedAt: "2026-07-19T10:20:30.000Z" };

describe("user export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.exportUserData.mockResolvedValue(envelope);
  });

  it("returns an authorized private attachment with deterministic headers", async () => {
    const response = await GET(new Request("http://localhost:3000/api/v1/export"));

    expect(response.status).toBe(200);
    expect(mocks.exportUserData).toHaveBeenCalledWith(actor);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="omplish-export-2026-07-19.json"',
    );
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-omplish-export-schema-version")).toBe("1");
    await expect(response.json()).resolves.toEqual(envelope);
  });

  it("rejects queries and unauthenticated access without dispatching an export", async () => {
    const queryResponse = await GET(new Request("http://localhost:3000/api/v1/export?format=json"));
    expect(queryResponse.status).toBe(400);
    expect(mocks.exportUserData).not.toHaveBeenCalled();

    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("private session detail"), { code: "UNAUTHENTICATED" }),
    );
    const unauthenticated = await GET(new Request("http://localhost:3000/api/v1/export"));
    expect(unauthenticated.status).toBe(401);
    expect(mocks.exportUserData).not.toHaveBeenCalled();
    expect(await unauthenticated.text()).not.toContain("private session detail");
  });
});
