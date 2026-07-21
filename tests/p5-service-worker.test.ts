import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

const origin = "https://opentask.example";
const currentBuildVersion = "1784615000000-a1b2c3d4";
const previousBuildVersion = "1784614000000-b2c3d4e5";
const olderBuildVersion = "1784613000000-c3d4e5f6";
const currentCacheName = `opentask-static-${currentBuildVersion}`;
const previousCacheName = `opentask-static-${previousBuildVersion}`;
const precachePaths = [
  "/offline.html",
  "/icons/opentask-192.png",
  "/icons/opentask-512.png",
  "/icons/opentask-maskable-512.png",
] as const;

let serviceWorkerSource: string;
let offlineDocument: string;

beforeEach(async () => {
  [serviceWorkerSource, offlineDocument] = await Promise.all([
    readFile(path.join(process.cwd(), "public/sw.js"), "utf8"),
    readFile(path.join(process.cwd(), "public/offline.html"), "utf8"),
  ]);
});

describe("P5 service worker", () => {
  it("installs only the reviewed public shell and removes only obsolete OpenTask caches on activate", async () => {
    const previousHarness = createHarness({ buildVersion: previousBuildVersion });
    await previousHarness.dispatchExtendable("install");
    const previousCache = await previousHarness.caches.open(previousCacheName);
    await previousCache.put(
      requestLike("/_next/static/chunks/previous-build-a1b2.js", { destination: "script" }),
      response("previous build script", "application/javascript", {
        "cache-control": "public, max-age=31536000, immutable",
      }),
    );
    const harness = createHarness({ caches: previousHarness.caches });
    await harness.caches.open(`opentask-static-${olderBuildVersion}`);
    await harness.caches.open("opentask-static-p4-v9");
    await harness.caches.open("another-application-cache");

    await harness.dispatchExtendable("install");

    expect((await harness.caches.keys()).sort()).toEqual(
      [
        "another-application-cache",
        currentCacheName,
        previousCacheName,
        `opentask-static-${olderBuildVersion}`,
        "opentask-static-p4-v9",
      ].sort(),
    );
    expect(await harness.cachedPaths(currentCacheName)).toEqual([...precachePaths].sort());
    expect(harness.self.skipWaiting).not.toHaveBeenCalled();
    expect(harness.fetchMock).toHaveBeenCalledTimes(precachePaths.length);
    for (const [input] of harness.fetchMock.mock.calls) {
      const request = input as Request;
      expect(request.cache).toBe("reload");
      expect(request.credentials).toBe("omit");
      expect(new URL(request.url).origin).toBe(origin);
    }

    await harness.dispatchExtendable("activate");

    expect((await harness.caches.keys()).sort()).toEqual(
      ["another-application-cache", currentCacheName, previousCacheName].sort(),
    );
    expect(harness.self.clients.claim).toHaveBeenCalledOnce();
    expect(harness.self.clients.matchAll).toHaveBeenCalledWith({
      includeUncontrolled: true,
      type: "window",
    });
    expect(harness.client.postMessage).toHaveBeenCalledWith({
      type: "OPENTASK_UPDATE_ACTIVATED",
      version: currentBuildVersion,
    });

    const oldTabAsset = harness.dispatchFetch(
      requestLike("/_next/static/chunks/previous-build-a1b2.js", { destination: "script" }),
    );
    expect(await (await oldTabAsset.response)?.text()).toBe("previous build script");
    expect(harness.fetchMock).toHaveBeenCalledTimes(precachePaths.length);
  });

  it("never intercepts API, mutation, range, cross-origin, or unversioned requests", async () => {
    const harness = createHarness();

    for (const request of [
      requestLike("/api/v1/tasks", { mode: "navigate" }),
      requestLike("/api/v1/export"),
      requestLike("/api/v1/tasks", { method: "POST" }),
      requestLike("/today", { method: "PATCH", mode: "navigate" }),
      requestLike("/download.bin", { headers: { range: "bytes=0-20" } }),
      requestLike("/unversioned.js", { destination: "script" }),
      requestLike("/_next/static/chunks/app.js?private=1", { destination: "script" }),
      requestLike("https://cdn.example/app-123.js", { destination: "script" }),
    ]) {
      const event = harness.dispatchFetch(request);
      expect(event.response).toBeUndefined();
    }

    expect(harness.fetchMock).not.toHaveBeenCalled();
    expect(await harness.caches.keys()).toEqual([]);
  });

  it("caches only immutable, type-matched same-origin Next assets and reuses the cached response", async () => {
    const harness = createHarness({
      responseFor(request) {
        const pathname = new URL(request.url).pathname;
        if (pathname.endsWith("safe-a1b2.js")) {
          return response("safe-static-script", "application/javascript", {
            "cache-control": "public, max-age=31536000, immutable",
          });
        }
        if (pathname.endsWith("not-immutable.js")) {
          return response("dynamic-script", "application/javascript", {
            "cache-control": "public, max-age=0, must-revalidate",
          });
        }
        if (pathname.endsWith("wrong-type.js")) {
          return response("not javascript", "text/html", {
            "cache-control": "public, max-age=31536000, immutable",
          });
        }
        if (pathname.endsWith("private.js")) {
          return response("private script", "application/javascript", {
            "cache-control": "private, max-age=31536000, immutable",
          });
        }
        throw new Error(`Unexpected request ${request.url}`);
      },
    });

    const safeRequest = requestLike("/_next/static/chunks/safe-a1b2.js", {
      destination: "script",
      headers: { authorization: "Bearer must-not-enter-the-cache-key" },
    });
    expect(await harness.dispatchFetch(safeRequest).response).toHaveProperty("status", 200);
    const fetchedRequest = harness.fetchMock.mock.calls[0]?.[0] as Request;
    expect(fetchedRequest.credentials).toBe("omit");
    expect(fetchedRequest.headers.has("authorization")).toBe(false);
    expect(await harness.cachedPaths(currentCacheName)).toContain("/_next/static/chunks/safe-a1b2.js");
    const callsAfterFirstRead = harness.fetchMock.mock.calls.length;
    expect(await (await harness.dispatchFetch(safeRequest).response)?.text()).toBe("safe-static-script");
    expect(harness.fetchMock).toHaveBeenCalledTimes(callsAfterFirstRead);

    await harness.dispatchFetch(
      requestLike("/_next/static/chunks/not-immutable.js", { destination: "script" }),
    ).response;
    await harness.dispatchFetch(requestLike("/_next/static/chunks/wrong-type.js", { destination: "script" }))
      .response;
    await harness.dispatchFetch(requestLike("/_next/static/chunks/private.js", { destination: "script" }))
      .response;

    expect(await harness.cachedPaths(currentCacheName)).toEqual(["/_next/static/chunks/safe-a1b2.js"]);
  });

  it("keeps online assets usable and the emergency fallback available when Cache Storage fails", async () => {
    const harness = createHarness({
      responseFor(request) {
        const pathname = new URL(request.url).pathname;
        if (pathname.startsWith("/_next/static/")) {
          return response("online script", "application/javascript", {
            "cache-control": "public, max-age=31536000, immutable",
          });
        }
        return publicAssetResponse(request.url);
      },
    });
    harness.caches.failOpen = true;

    const onlineAsset = harness.dispatchFetch(
      requestLike("/_next/static/chunks/online-a1b2.js", { destination: "script" }),
    );
    expect(await (await onlineAsset.response)?.text()).toBe("online script");

    harness.rejectNavigations = true;
    const offlineNavigation = harness.dispatchFetch(requestLike("/today", { mode: "navigate" }));
    const emergency = await offlineNavigation.response;
    expect(emergency?.status).toBe(503);
    expect(await emergency?.text()).toContain("emergency-content-free");

    harness.rejectNavigations = false;
    harness.caches.failOpen = false;
    await harness.caches.open(currentCacheName);
    harness.caches.failPuts = true;
    const quotaLimitedAsset = harness.dispatchFetch(
      requestLike("/_next/static/chunks/quota-a1b2.js", { destination: "script" }),
    );
    expect(await (await quotaLimitedAsset.response)?.text()).toBe("online script");

    const publicIcon = harness.dispatchFetch(requestLike("/icons/opentask-192.png"));
    expect((await publicIcon.response)?.status).toBe(200);
  });

  it("uses the content-free fallback for failed navigation and an emergency response for missing or corrupt fallback data", async () => {
    const harness = createHarness();
    await harness.dispatchExtendable("install");
    harness.rejectNavigations = true;

    const cachedFallback = await harness.dispatchFetch(requestLike("/today", { mode: "navigate" })).response;
    expect(cachedFallback?.status).toBe(200);
    expect(await cachedFallback?.text()).toContain('data-opentask-offline-fallback="content-free"');

    await harness.caches.delete(currentCacheName);
    const missingFallback = await harness.dispatchFetch(requestLike("/inbox", { mode: "navigate" })).response;
    expect(missingFallback?.status).toBe(503);
    expect(missingFallback?.headers.get("cache-control")).toBe("no-store");
    expect(missingFallback?.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await missingFallback?.text()).toContain("emergency-content-free");

    const cache = await harness.caches.open(currentCacheName);
    await cache.put(
      "/offline.html",
      response("private corrupt fallback", "application/json", undefined, 200),
    );
    const corruptFallback = await harness.dispatchFetch(requestLike("/settings", { mode: "navigate" }))
      .response;
    expect(corruptFallback?.status).toBe(503);
    const corruptFallbackBody = await corruptFallback?.text();
    expect(corruptFallbackBody).not.toContain("private corrupt fallback");
    expect(corruptFallbackBody).toContain("emergency-content-free");

    await cache.put(
      "/offline.html",
      response("markerless html fallback", "text/html; charset=utf-8", undefined, 200),
    );
    const markerlessFallback = await harness.dispatchFetch(requestLike("/today", { mode: "navigate" }))
      .response;
    expect(markerlessFallback?.status).toBe(503);
    expect(await markerlessFallback?.text()).not.toContain("markerless html fallback");
  });

  it("requires explicit lifecycle messages and reports version and repair outcomes", async () => {
    const harness = createHarness();

    const ignored = harness.dispatchMessage({ type: "UNKNOWN" });
    await ignored.settled;
    expect(harness.self.skipWaiting).not.toHaveBeenCalled();
    expect(ignored.port.postMessage).not.toHaveBeenCalled();

    const version = harness.dispatchMessage({ type: "GET_VERSION" });
    await version.settled;
    expect(version.port.postMessage).toHaveBeenCalledWith({ ok: true, version: currentBuildVersion });

    const skip = harness.dispatchMessage({ type: "SKIP_WAITING" });
    await skip.settled;
    expect(harness.self.skipWaiting).toHaveBeenCalledOnce();

    const repair = harness.dispatchMessage({ type: "REPAIR_STATIC_SHELL" });
    await repair.settled;
    expect(repair.port.postMessage).toHaveBeenCalledWith({ ok: true, version: currentBuildVersion });
    expect(await harness.cachedPaths(currentCacheName)).toEqual([...precachePaths].sort());

    harness.failPublicAssets = true;
    const failedRepair = harness.dispatchMessage({ type: "REPAIR_STATIC_SHELL" });
    await failedRepair.settled;
    expect(failedRepair.port.postMessage).toHaveBeenCalledWith({
      ok: false,
      version: currentBuildVersion,
    });
  });
});

type ServiceWorkerEventType = "activate" | "fetch" | "install" | "message";
type ServiceWorkerListener = (event: Record<string, unknown>) => void;
type RequestShape = Readonly<{
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: Headers;
}>;

function createHarness(
  options: {
    buildVersion?: string;
    caches?: MemoryCacheStorage;
    responseFor?(request: Request): Response | Promise<Response>;
  } = {},
) {
  const listeners = new Map<ServiceWorkerEventType, ServiceWorkerListener>();
  const caches = options.caches ?? new MemoryCacheStorage();
  const client = { postMessage: vi.fn() };
  const buildVersion = options.buildVersion ?? currentBuildVersion;
  const self = {
    location: { href: `${origin}/sw.js?build=${buildVersion}`, origin },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => [client]),
    },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener(type: ServiceWorkerEventType, listener: ServiceWorkerListener) {
      listeners.set(type, listener);
    },
  };
  const state = { failPublicAssets: false, rejectNavigations: false };
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    if (state.rejectNavigations && !precachePaths.includes(new URL(request.url).pathname as never)) {
      throw new TypeError("offline");
    }
    if (state.failPublicAssets && precachePaths.includes(new URL(request.url).pathname as never)) {
      throw new TypeError("offline");
    }
    if (options.responseFor) return options.responseFor(request);
    return publicAssetResponse(request.url);
  });

  vm.runInNewContext(serviceWorkerSource, {
    URL,
    Request,
    Response,
    Map,
    Set,
    Promise,
    Error,
    caches,
    fetch: fetchMock,
    self,
  });

  function requireListener(type: ServiceWorkerEventType) {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`Missing ${type} listener.`);
    return listener;
  }

  async function dispatchExtendable(type: "activate" | "install") {
    const promises: Promise<unknown>[] = [];
    requireListener(type)({
      waitUntil(value: Promise<unknown>) {
        promises.push(value);
      },
    });
    await Promise.all(promises);
  }

  function dispatchFetch(request: RequestShape) {
    let response: Promise<Response> | undefined;
    const promises: Promise<unknown>[] = [];
    requireListener("fetch")({
      request,
      respondWith(value: Promise<Response>) {
        response = Promise.resolve(value);
      },
      waitUntil(value: Promise<unknown>) {
        promises.push(value);
      },
    });
    return { response, settled: Promise.all(promises) };
  }

  function dispatchMessage(data: unknown) {
    const promises: Promise<unknown>[] = [];
    const port = { postMessage: vi.fn() };
    requireListener("message")({
      data,
      ports: [port],
      waitUntil(value: Promise<unknown>) {
        promises.push(value);
      },
    });
    return { port, settled: Promise.all(promises) };
  }

  return {
    caches,
    client,
    fetchMock,
    self,
    dispatchExtendable,
    dispatchFetch,
    dispatchMessage,
    cachedPaths: (name: string) => caches.paths(name),
    get failPublicAssets() {
      return state.failPublicAssets;
    },
    set failPublicAssets(value: boolean) {
      state.failPublicAssets = value;
    },
    get rejectNavigations() {
      return state.rejectNavigations;
    },
    set rejectNavigations(value: boolean) {
      state.rejectNavigations = value;
    },
  };
}

class MemoryCacheStorage {
  readonly stores = new Map<string, MemoryCache>();
  failOpen = false;
  failPuts = false;

  async keys() {
    return [...this.stores.keys()];
  }

  async open(name: string) {
    if (this.failOpen) throw new Error("CacheStorage open failed");
    const existing = this.stores.get(name);
    if (existing) return existing;
    const cache = new MemoryCache(this);
    this.stores.set(name, cache);
    return cache;
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }

  async paths(name: string) {
    const cache = this.stores.get(name);
    if (!cache) return [];
    return [...cache.entries.keys()].map((url) => new URL(url).pathname).sort();
  }
}

class MemoryCache {
  readonly entries = new Map<string, Response>();
  private readonly storage: MemoryCacheStorage;

  constructor(storage: MemoryCacheStorage) {
    this.storage = storage;
  }

  async put(request: string | Request | RequestShape, responseValue: Response) {
    if (this.storage.failPuts) throw new Error("CacheStorage put failed");
    this.entries.set(cacheKey(request), responseValue.clone());
  }

  async match(request: string | Request | RequestShape) {
    return this.entries.get(cacheKey(request))?.clone();
  }
}

function cacheKey(request: string | Request | RequestShape) {
  return new URL(typeof request === "string" ? request : request.url, origin).href;
}

function requestLike(
  path: string,
  options: {
    method?: string;
    mode?: string;
    destination?: string;
    headers?: HeadersInit;
  } = {},
): RequestShape {
  return {
    url: new URL(path, origin).href,
    method: options.method ?? "GET",
    mode: options.mode ?? "same-origin",
    destination: options.destination ?? "",
    headers: new Headers(options.headers),
  };
}

function publicAssetResponse(url: string) {
  const pathname = new URL(url).pathname;
  if (pathname === "/offline.html") {
    return response(offlineDocument, "text/html; charset=utf-8", {
      "x-opentask-offline-fallback": "content-free",
    });
  }
  if (precachePaths.includes(pathname as never)) return response("original-icon", "image/png");
  return response("network navigation", "text/html; charset=utf-8");
}

function response(
  body: BodyInit,
  contentType: string,
  headers: HeadersInit | undefined = undefined,
  status = 200,
) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType, ...Object.fromEntries(new Headers(headers)) },
  });
}
