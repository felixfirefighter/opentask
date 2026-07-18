import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  parseTaskApiQuery,
  privateTaskJson,
  taskApiResponse,
  taskCreateJson,
} from "./_support";

const resourceId = "11111111-1111-4111-8111-111111111111";

describe("task API support", () => {
  it("requires a UUIDv4 create key", () => {
    expect(parseTaskApiCreateId(new Headers({ "idempotency-key": resourceId }))).toBe(resourceId);
    expect(() => parseTaskApiCreateId(new Headers())).toThrow();
  });

  it("rejects duplicate and unknown query parameters", () => {
    const schema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50) });
    expect(parseTaskApiQuery(new Request("http://localhost/api/v1/folders?limit=10"), schema)).toEqual({
      limit: 10,
    });
    expect(() =>
      parseTaskApiQuery(new Request("http://localhost/api/v1/folders?limit=10&limit=20"), schema),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() =>
      parseTaskApiQuery(new Request("http://localhost/api/v1/folders?unexpected=1"), schema),
    ).toThrow();
    expect(() =>
      parseTaskApiQuery(new Request("http://localhost/api/v1/folders?__proto__=unexpected"), schema),
    ).toThrow();
  });

  it("rejects every query parameter on endpoints without a query contract", () => {
    expect(() => assertNoTaskApiQuery(new Request("http://localhost/api/v1/folders/one"))).not.toThrow();
    expect(() =>
      assertNoTaskApiQuery(new Request("http://localhost/api/v1/folders/one?unexpected=1")),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("maps application failures and marks JSON private", async () => {
    const response = await taskApiResponse(() => {
      throw Object.assign(new Error("no session"), { code: "UNAUTHENTICATED" });
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const json = privateTaskJson({ ok: true }, { status: 201 });
    expect(json.status).toBe(201);
    expect(json.headers.get("cache-control")).toBe("no-store");

    const created = taskCreateJson(
      { created: true, value: { id: resourceId } },
      `/api/v1/tags/${resourceId}`,
    );
    expect(created.status).toBe(201);
    expect(created.headers.get("location")).toBe(`/api/v1/tags/${resourceId}`);
    expect(taskCreateJson({ created: false, value: { id: resourceId } }, "unused").status).toBe(200);
  });
});
