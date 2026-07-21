const CACHE_NAMESPACE = "opentask-static-";
const requestedBuildVersion = new URL(self.location.href).searchParams.get("build") ?? "";
const CACHE_VERSION = /^\d{13}-[a-f0-9]{8}$/u.test(requestedBuildVersion)
  ? requestedBuildVersion
  : "unversioned";
const STATIC_CACHE = `${CACHE_NAMESPACE}${CACHE_VERSION}`;
const INSTALL_CACHE = `${CACHE_NAMESPACE}install-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_PATH = "/offline.html";
const OFFLINE_FALLBACK_MARKER = "content-free";
const PRECACHE_PATHS = [
  OFFLINE_FALLBACK_PATH,
  "/icons/opentask-192.png",
  "/icons/opentask-512.png",
  "/icons/opentask-maskable-512.png",
];
const PRECACHE_CONTENT_TYPES = new Map([
  [OFFLINE_FALLBACK_PATH, "text/html"],
  ["/icons/opentask-192.png", "image/png"],
  ["/icons/opentask-512.png", "image/png"],
  ["/icons/opentask-maskable-512.png", "image/png"],
]);
const STATIC_DESTINATIONS = new Set(["font", "image", "script", "style"]);
const EMERGENCY_FALLBACK = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F4F1E9"><title>OpenTask is offline</title><style>body{box-sizing:border-box;display:grid;min-width:320px;min-height:100vh;place-items:center;margin:0;padding:24px;background:#F4F1E9;color:#24251F;font:15px/1.5 system-ui,sans-serif}main{max-width:480px;padding:32px;border:1px solid #77756E;border-radius:20px;background:#FCFBF7}h1{margin:0 0 12px;font-size:26px;line-height:32px}p{margin:0}a{display:inline-flex;min-height:44px;align-items:center;margin-top:24px;padding:0 16px;border-radius:8px;background:#252823;color:#FEFCF7;font-weight:600;text-decoration:none}a:focus-visible{outline:2px solid #2A61B8;outline-offset:2px}</style></head><body data-opentask-offline-fallback="emergency-content-free"><main><h1>OpenTask is offline</h1><p>No account or task data is stored in this fallback. Reconnect to open your workspace.</p><a href="/today">Try connection</a></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(installStaticShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateStaticShell());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname.startsWith("/api/")) return;
    event.respondWith(openNavigationOrFallback(request));
    return;
  }

  if (PRECACHE_CONTENT_TYPES.has(url.pathname) && url.search === "") {
    event.respondWith(readSafePublicAsset(request, url.pathname));
    return;
  }

  if (isVersionedNextAsset(request, url)) {
    event.respondWith(readVersionedNextAsset(request));
  }
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (message.type === "REPAIR_STATIC_SHELL") {
    event.waitUntil(
      repairStaticShell()
        .then(() => reply(event, { ok: true, version: CACHE_VERSION }))
        .catch(() => reply(event, { ok: false, version: CACHE_VERSION })),
    );
    return;
  }

  if (message.type === "GET_VERSION") {
    reply(event, { ok: true, version: CACHE_VERSION });
  }
});

async function installStaticShell() {
  await caches.delete(INSTALL_CACHE);
  const staged = await caches.open(INSTALL_CACHE);

  try {
    for (const path of PRECACHE_PATHS) {
      const response = await fetchPublicAsset(path);
      await staged.put(path, response);
    }

    await caches.delete(STATIC_CACHE);
    const target = await caches.open(STATIC_CACHE);
    for (const path of PRECACHE_PATHS) {
      const response = await staged.match(path);
      if (!response) throw new Error("Static shell staging cache is incomplete.");
      await target.put(path, response);
    }
  } catch (error) {
    await caches.delete(INSTALL_CACHE);
    await caches.delete(STATIC_CACHE);
    throw error;
  }

  await caches.delete(INSTALL_CACHE);
}

async function repairStaticShell() {
  const replacements = [];
  for (const path of PRECACHE_PATHS) replacements.push([path, await fetchPublicAsset(path)]);

  const cache = await caches.open(STATIC_CACHE);
  for (const [path, response] of replacements) await cache.put(path, response);
}

async function fetchPublicAsset(path) {
  const request = new Request(new URL(path, self.location.origin), {
    cache: "reload",
    credentials: "omit",
  });
  const response = await fetch(request);
  const expectedContentType = PRECACHE_CONTENT_TYPES.get(path);
  if (!isUsablePublicResponse(response, path, expectedContentType)) {
    throw new Error("Static shell asset response is invalid.");
  }
  return response;
}

async function activateStaticShell() {
  const cacheNames = await caches.keys();
  const previousCache = selectPreviousOpenTaskCache(cacheNames);
  const retainedCaches = new Set([STATIC_CACHE, ...(previousCache ? [previousCache] : [])]);
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(CACHE_NAMESPACE) && !retainedCaches.has(name))
      .map((name) => caches.delete(name)),
  );
  await self.clients.claim();
  if (!previousCache) return;

  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "OPENTASK_UPDATE_ACTIVATED", version: CACHE_VERSION });
  }
}

function selectPreviousOpenTaskCache(cacheNames) {
  const candidates = cacheNames.filter(
    (name) =>
      name.startsWith(CACHE_NAMESPACE) &&
      name !== STATIC_CACHE &&
      !name.startsWith(`${CACHE_NAMESPACE}install-`),
  );
  const productionGenerations = candidates
    .filter((name) => /^opentask-static-\d{13}-[a-f0-9]{8}$/u.test(name))
    .sort()
    .reverse();
  return (
    productionGenerations[0] ??
    (candidates.includes(`${CACHE_NAMESPACE}p5-v1`) ? `${CACHE_NAMESPACE}p5-v1` : null)
  );
}

async function openNavigationOrFallback(request) {
  try {
    return await fetch(request);
  } catch {
    try {
      const cache = await caches.open(STATIC_CACHE);
      const fallback = await cache.match(OFFLINE_FALLBACK_PATH);
      if (isUsablePublicResponse(fallback, OFFLINE_FALLBACK_PATH, "text/html")) return fallback;
    } catch {
      // CacheStorage is best-effort. The embedded response is the final content-free fallback.
    }
    return emergencyFallbackResponse();
  }
}

async function readSafePublicAsset(request, path) {
  const expectedContentType = PRECACHE_CONTENT_TYPES.get(path);
  let cache = null;

  try {
    cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(path);
    if (isUsablePublicResponse(cached, path, expectedContentType)) return cached;
  } catch {
    cache = null;
  }

  try {
    const response = await fetchPublicAsset(path);
    if (cache) void cache.put(path, response.clone()).catch(() => undefined);
    return response;
  } catch (error) {
    if (path === OFFLINE_FALLBACK_PATH) return emergencyFallbackResponse();
    throw error;
  }
}

async function readVersionedNextAsset(request) {
  const cacheRequest = versionedStaticRequest(request.url);
  let cache = null;

  try {
    cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(cacheRequest);
    if (cached && isCacheableNextResponse(request, cached)) return cached;
  } catch {
    cache = null;
  }

  const previous = await readPreviousVersionedAsset(request, cacheRequest);
  if (previous) return previous;

  const response = await fetch(cacheRequest);
  if (cache && isCacheableNextResponse(request, response)) {
    await cache.put(cacheRequest, response.clone()).catch(() => undefined);
  }
  return response;
}

async function readPreviousVersionedAsset(request, cacheRequest) {
  try {
    const previousCacheName = selectPreviousOpenTaskCache(await caches.keys());
    if (!previousCacheName) return null;
    const previousCache = await caches.open(previousCacheName);
    const cached = await previousCache.match(cacheRequest);
    return cached && isCacheableNextResponse(request, cached) ? cached : null;
  } catch {
    return null;
  }
}

function versionedStaticRequest(url) {
  return new Request(url, {
    cache: "no-cache",
    credentials: "omit",
    method: "GET",
    mode: "same-origin",
  });
}

function isVersionedNextAsset(request, url) {
  return (
    url.pathname.startsWith("/_next/static/") &&
    url.search === "" &&
    !request.headers.has("range") &&
    STATIC_DESTINATIONS.has(request.destination)
  );
}

function isCacheableNextResponse(request, response) {
  if (
    !response.ok ||
    response.redirected ||
    (response.type !== "basic" && response.type !== "default") ||
    !STATIC_DESTINATIONS.has(request.destination)
  ) {
    return false;
  }
  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
  if (
    !cacheControl.includes("immutable") ||
    cacheControl.includes("private") ||
    cacheControl.includes("no-store")
  ) {
    return false;
  }
  if (response.headers.has("set-cookie") || response.headers.has("content-disposition")) return false;
  if (response.headers.get("vary")?.trim() === "*") return false;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (request.destination === "script") return contentType.includes("javascript");
  if (request.destination === "style") return contentType.includes("text/css");
  if (request.destination === "font") return contentType.startsWith("font/");
  return request.destination === "image" && contentType.startsWith("image/");
}

function isUsablePublicResponse(response, path, expectedContentType) {
  if (
    !response?.ok ||
    response.redirected ||
    (response.type !== "basic" && response.type !== "default") ||
    !expectedContentType ||
    !response.headers.get("content-type")?.toLowerCase().includes(expectedContentType) ||
    response.headers.has("set-cookie") ||
    response.headers.has("content-disposition")
  ) {
    return false;
  }

  if (response.url) {
    const responseUrl = new URL(response.url);
    if (responseUrl.origin !== self.location.origin || responseUrl.pathname !== path) return false;
  }

  return (
    path !== OFFLINE_FALLBACK_PATH ||
    response.headers.get("x-opentask-offline-fallback") === OFFLINE_FALLBACK_MARKER
  );
}

function emergencyFallbackResponse() {
  return new Response(EMERGENCY_FALLBACK, {
    status: 503,
    statusText: "Offline",
    headers: {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "x-opentask-offline-fallback": "emergency-content-free",
      "x-content-type-options": "nosniff",
    },
  });
}

function reply(event, payload) {
  event.ports?.[0]?.postMessage(payload);
}
