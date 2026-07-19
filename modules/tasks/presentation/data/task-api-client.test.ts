import { afterEach, describe, expect, it, vi } from "vitest";

import { listTasks } from "./task-api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("task API client input boundary", () => {
  it("rejects invalid query input before making a request", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => listTasks({ listId: "not-a-uuid" } as never)).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
