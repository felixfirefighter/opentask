import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readConnectivityStatus,
  reportConnectivityFailure,
  resetConnectivityStateForTests,
} from "./connectivity-store";
import { fetchWithConnectivity } from "./fetch-with-connectivity";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetConnectivityStateForTests();
});

describe("fetchWithConnectivity", () => {
  it("treats every received HTTP response as reachable, including an application error", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    reportConnectivityFailure(new TypeError("previous request failed"));
    const response = new Response(null, { status: 503 });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithConnectivity("/api/v1/tasks", { cache: "no-store" })).resolves.toBe(response);
    expect(readConnectivityStatus()).toBe("online");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/tasks", { cache: "no-store" });
  });

  it("rethrows a network failure after blocking later writes", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const error = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(error));

    await expect(fetchWithConnectivity("/api/v1/tasks")).rejects.toBe(error);
    expect(readConnectivityStatus()).toBe("network-unreachable");
  });

  it("does not turn an intentional abort into a connectivity failure", async () => {
    const error = new DOMException("cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(error));

    await expect(fetchWithConnectivity("/api/v1/tasks")).rejects.toBe(error);
    expect(readConnectivityStatus()).toBe("online");
  });
});
