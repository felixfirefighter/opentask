import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { TaskApiError, requestTaskJson, taskJsonMutation, taskQueryPath } from "./task-api-request";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("task API request boundary", () => {
  it("parses a successful response and sends the required same-origin JSON headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ taskId: "task-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestTaskJson(
        "/api/v1/tasks",
        z.strictObject({ taskId: z.string() }),
        taskJsonMutation("POST", { title: "Ship the demo" }, { "idempotency-key": "task-1" }),
      ),
    ).resolves.toEqual({ taskId: "task-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(path).toBe("/api/v1/tasks");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ title: "Ship the demo" }),
    });
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBe("task-1");
  });

  it("preserves structured conflict metadata for recovery", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          type: "https://omplish.test/problems/conflict",
          title: "Conflict",
          status: 409,
          code: "CONFLICT",
          detail: "This task changed on another device.",
          correlationId: "request-123",
          currentVersion: 7,
        },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = requestTaskJson("/api/v1/tasks/task-1", z.unknown());

    await expect(request).rejects.toMatchObject({
      name: "TaskApiError",
      code: "CONFLICT",
      status: 409,
      message: "This task changed on another device.",
      correlationId: "request-123",
      currentVersion: 7,
    });
    await expect(request).rejects.toBeInstanceOf(TaskApiError);
  });

  it("maps a malformed successful response to a safe internal error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ taskId: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestTaskJson("/api/v1/tasks/task-1", z.strictObject({ taskId: z.string() })),
    ).rejects.toMatchObject({
      name: "TaskApiError",
      code: "INTERNAL",
      status: 500,
      message: "The server returned an unreadable task response. Refresh and try again.",
    });
  });

  it("omits absent query values while retaining explicit values", () => {
    expect(
      taskQueryPath("/api/v1/tasks", {
        listId: "list-1",
        sectionId: null,
        cursor: undefined,
        limit: 50,
        status: "open",
      }),
    ).toBe("/api/v1/tasks?listId=list-1&limit=50&status=open");
  });
});
