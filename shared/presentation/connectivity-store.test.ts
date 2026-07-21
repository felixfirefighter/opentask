import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readConnectivityStatus,
  reportConnectivityFailure,
  reportConnectivityResponse,
  resetConnectivityStateForTests,
  retryConnectivity,
  subscribeToConnectivity,
} from "./connectivity-store";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetConnectivityStateForTests();
});

describe("connectivity store", () => {
  it("moves a thrown network failure to unreachable and any HTTP response back online", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const listener = vi.fn();
    const unsubscribe = subscribeToConnectivity(listener);

    reportConnectivityFailure(new TypeError("network failed"));
    expect(readConnectivityStatus()).toBe("network-unreachable");

    reportConnectivityResponse();
    expect(readConnectivityStatus()).toBe("online");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("distinguishes browser-offline failures and ignores an aborted request", () => {
    let online = false;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);

    reportConnectivityFailure(new TypeError("network failed"));
    expect(readConnectivityStatus()).toBe("browser-offline");

    online = true;
    reportConnectivityResponse();
    reportConnectivityFailure(new DOMException("cancelled", "AbortError"));
    expect(readConnectivityStatus()).toBe("online");
  });

  it("probes once after the browser reconnects and exposes recovering until the server responds", async () => {
    let online = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
    let resolveProbe: ((response: Response) => void) | undefined;
    const probeResponse = new Promise<Response>((resolve) => {
      resolveProbe = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(probeResponse);
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    const unsubscribe = subscribeToConnectivity(listener);

    online = false;
    window.dispatchEvent(new Event("offline"));
    expect(readConnectivityStatus()).toBe("browser-offline");

    online = true;
    window.dispatchEvent(new Event("online"));
    expect(readConnectivityStatus()).toBe("recovering");
    expect(fetchMock).toHaveBeenCalledWith("/api/health/live", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: expect.any(AbortSignal),
    });

    const repeatedProbe = retryConnectivity();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveProbe?.(Response.json({ status: "ok" }));
    await expect(repeatedProbe).resolves.toBe(true);
    expect(readConnectivityStatus()).toBe("online");
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("keeps writes blocked when a recovery probe fails and retries from the window focus signal", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("still unreachable"))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const unsubscribe = subscribeToConnectivity(() => undefined);

    reportConnectivityFailure(new TypeError("request failed"));
    await expect(retryConnectivity()).resolves.toBe(false);
    expect(readConnectivityStatus()).toBe("network-unreachable");

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(readConnectivityStatus()).toBe("online"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("bounds a hung recovery probe and allows another recovery attempt", async () => {
    vi.useFakeTimers();
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const neverResponds = new Promise<Response>(() => undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(neverResponds)
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const firstAttempt = retryConnectivity();
    expect(readConnectivityStatus()).toBe("recovering");

    await vi.advanceTimersByTimeAsync(8_000);
    await expect(firstAttempt).resolves.toBe(false);
    const firstRequest = fetchMock.mock.calls[0]?.[1];
    expect(firstRequest?.signal?.aborted).toBe(true);
    expect(readConnectivityStatus()).toBe("network-unreachable");

    await expect(retryConnectivity()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readConnectivityStatus()).toBe("online");
  });
});
