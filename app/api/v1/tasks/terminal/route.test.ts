import type * as TasksModule from "@/modules/tasks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getTasksApplication: vi.fn(),
  listTerminalTasks: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof TasksModule>()),
  getTasksApplication: mocks.getTasksApplication,
}));

import { GET } from "./route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };

describe("terminal task API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getTasksApplication.mockReturnValue({ tasks: { listTerminalTasks: mocks.listTerminalTasks } });
    mocks.listTerminalTasks.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("dispatches a strict authenticated status page and prevents private caching", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/v1/tasks/terminal?status=completed&limit=10"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: null });
    expect(mocks.listTerminalTasks).toHaveBeenCalledWith(actor, { status: "completed", limit: 10 });
  });

  it("rejects missing, open, duplicate, unknown, and out-of-range query values", async () => {
    const invalidQueries = [
      "limit=10",
      "status=open",
      "status=completed&status=cancelled",
      "status=completed&unexpected=1",
      "status=cancelled&limit=101",
    ];
    for (const query of invalidQueries) {
      const response = await GET(new Request(`http://localhost:3000/api/v1/tasks/terminal?${query}`));
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.listTerminalTasks).not.toHaveBeenCalled();
  });

  it("authenticates before parsing the query and returns the private error contract", async () => {
    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("sensitive authentication detail"), { code: "UNAUTHENTICATED" }),
    );
    const response = await GET(new Request("http://localhost:3000/api/v1/tasks/terminal?unexpected=secret"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNAUTHENTICATED",
      detail: "Sign in to continue.",
    });
    expect(mocks.listTerminalTasks).not.toHaveBeenCalled();
  });
});
