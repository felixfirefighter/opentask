import type * as TasksModule from "@/modules/tasks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getTasksApplication: vi.fn(),
  searchTasks: vi.fn(),
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

describe("task search API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getTasksApplication.mockReturnValue({ search: { searchTasks: mocks.searchTasks } });
    mocks.searchTasks.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("returns an authenticated strict search page with private caching", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/v1/tasks/search?q=%20launch%20&limit=10"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: null });
    expect(mocks.searchTasks).toHaveBeenCalledWith(actor, { q: "launch", limit: 10 });
  });

  it("rejects missing, duplicate, unknown, and oversized query values before search", async () => {
    const invalidQueries = ["limit=10", "q=launch&q=ship", "q=launch&unexpected=1", `q=${"x".repeat(121)}`];
    for (const query of invalidQueries) {
      const response = await GET(new Request(`http://localhost:3000/api/v1/tasks/search?${query}`));
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.searchTasks).not.toHaveBeenCalled();
  });

  it("authenticates before parsing query values and maps the stable private problem", async () => {
    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("sensitive authentication detail"), { code: "UNAUTHENTICATED" }),
    );
    const response = await GET(new Request("http://localhost:3000/api/v1/tasks/search?unexpected=secret"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      type: "urn:opentask:problem:unauthenticated",
      code: "UNAUTHENTICATED",
      detail: "Sign in to continue.",
    });
    expect(mocks.searchTasks).not.toHaveBeenCalled();
  });
});
