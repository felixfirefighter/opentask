import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { signUpThroughUi } from "./support/wp01-auth";
import { quickAddTask } from "./support/wp03-tasks";

const interactiveProjects = new Set(["desktop-chromium", "tablet-chromium", "mobile-chromium"]);
const precachedPaths = [
  "/offline.html",
  "/icons/opentask-192.png",
  "/icons/opentask-512.png",
  "/icons/opentask-maskable-512.png",
] as const;

test("the manifest, icons, worker scope, and cache cleanup satisfy the installable-shell contract", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One Chromium installability audit is sufficient.");

  await page.goto("/offline.html");
  await page.evaluate(async () => {
    const oldOpenTaskCache = await caches.open("opentask-static-obsolete-proof");
    await oldOpenTaskCache.put("/old-opentask-proof", new Response("old"));
    const unrelatedCache = await caches.open("another-product-cache");
    await unrelatedCache.put("/unrelated-proof", new Response("preserve"));
  });

  await page.goto("/");
  const registration = await waitForPwaControl(page);
  const applicationOrigin = new URL(page.url()).origin;
  expect(registration.scope).toBe(`${applicationOrigin}/`);
  const workerUrl = new URL(registration.scriptUrl ?? "", applicationOrigin);
  expect(workerUrl.origin).toBe(applicationOrigin);
  expect(workerUrl.pathname).toBe("/sw.js");
  expect(workerUrl.searchParams.get("build")).toMatch(/^\d{13}-[a-f0-9]{8}$/u);

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  expect(manifestResponse.headers()["cache-control"]).toContain("no-cache");
  const manifest = (await manifestResponse.json()) as WebAppManifest;
  expect(manifest).toMatchObject({
    id: "/",
    name: "OpenTask",
    short_name: "OpenTask",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    prefer_related_applications: false,
  });
  expect(manifest.icons).toEqual([
    expect.objectContaining({ src: "/icons/opentask-192.png", sizes: "192x192", purpose: "any" }),
    expect.objectContaining({ src: "/icons/opentask-512.png", sizes: "512x512", purpose: "any" }),
    expect.objectContaining({
      src: "/icons/opentask-maskable-512.png",
      sizes: "512x512",
      purpose: "maskable",
    }),
  ]);

  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(readPngDimensions(await response.body())).toEqual(parseManifestSize(icon.sizes));
  }

  const workerResponse = await page.request.get("/sw.js");
  expect(workerResponse.status()).toBe(200);
  expect(workerResponse.headers()["cache-control"]).toContain("no-store");
  expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");

  const offlineFallbackResponse = await page.request.get("/offline.html");
  expect(offlineFallbackResponse.headers()["x-opentask-offline-fallback"]).toBe("content-free");

  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain("another-product-cache");
  expect(cacheNames).not.toContain("opentask-static-obsolete-proof");
  expect(cacheNames.filter((name) => name.startsWith("opentask-static-"))).toHaveLength(1);

  const session = await context.newCDPSession(page);
  await session.send("Page.enable");
  const browserManifest = (await session.send("Page.getAppManifest")) as BrowserManifestResult;
  expect(browserManifest.errors).toEqual([]);
  expect(JSON.parse(browserManifest.data ?? "{}")).toMatchObject({
    name: "OpenTask",
    display: "standalone",
    scope: "/",
  });
  const installability = (await session.send("Page.getInstallabilityErrors")) as BrowserInstallabilityResult;
  expect(installability.installabilityErrors.map((error) => error.errorId)).toEqual([]);
});

test("an already-open workspace is read-only offline, never replays a write, and recovers cleanly", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !interactiveProjects.has(testInfo.project.name),
    "The read-only and cold-fallback path runs at desktop and mobile widths.",
  );
  test.setTimeout(90_000);

  const account = await signUpThroughUi(page, testInfo);
  const retainedTask = await quickAddTask(page, `P5 retained task ${randomUUID()}`);
  await waitForPwaControl(page);

  const rejectedTitle = `P5 must never replay ${randomUUID()}`;
  const rejectedRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.postData()?.includes(rejectedTitle)) {
      rejectedRequests.push(request.url());
    }
  });

  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(page.getByText(retainedTask.title, { exact: true })).toBeVisible();
  await expect(page.getByLabel("New task", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: `Complete ${retainedTask.title}` })).toBeDisabled();

  const offlineAttempt = await page.evaluate(
    async ({ idempotencyKey, listId, title }) => {
      try {
        await fetch("/api/v1/tasks", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            title,
            descriptionMd: "",
            priority: "none",
            listId,
            sectionId: null,
            parentTaskId: null,
            placement: { kind: "start" },
          }),
        });
        return "resolved";
      } catch {
        return "rejected";
      }
    },
    { idempotencyKey: randomUUID(), listId: retainedTask.listId, title: rejectedTitle },
  );
  expect(offlineAttempt).toBe("rejected");
  expect(rejectedRequests).toHaveLength(1);

  await context.setOffline(false);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeHidden();
  await expect(page.getByLabel("New task", { exact: true })).toBeEnabled();
  await page.waitForLoadState("networkidle");
  expect(rejectedRequests).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await expect(page.getByText(rejectedTitle, { exact: true })).toHaveCount(0);
  await quickAddTask(page, `P5 recovered write ${randomUUID()}`);

  await context.setOffline(true);
  const coldPage = await context.newPage();
  const fallbackResponse = await coldPage.goto("/today", { waitUntil: "domcontentloaded" });
  expect(fallbackResponse?.status()).toBe(200);
  await expect(coldPage.locator('body[data-opentask-offline-fallback="content-free"]')).toBeVisible();
  await expect(coldPage.getByRole("heading", { name: "OpenTask is offline" })).toBeVisible();
  await expect(coldPage.locator("main p").last()).toContainText(
    "does not save changes for later while offline.",
  );
  await expect(coldPage.getByText(retainedTask.title, { exact: true })).toHaveCount(0);
  await expect(coldPage.getByText(account.email, { exact: true })).toHaveCount(0);
  await expectNoSeriousViolations(coldPage);
  await expectNoHorizontalOverflow(coldPage);

  await context.setOffline(false);
  await coldPage.getByRole("link", { name: "Try connection" }).click();
  await expect(coldPage.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
});

test("authenticated HTML, APIs, exports, and user content never enter the static cache", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One complete cache inventory is sufficient.");
  test.setTimeout(90_000);

  const account = await signUpThroughUi(page, testInfo);
  const privateTaskTitle = `P5 private cache sentinel ${randomUUID()}`;
  await quickAddTask(page, privateTaskTitle);
  await waitForPwaControl(page);

  for (const route of ["/today", "/plan", "/settings", "/inbox"] as const) {
    await page.goto(route);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
  }

  const exportProbe = await page.evaluate(async () => {
    const response = await fetch("/api/v1/export", { credentials: "same-origin" });
    return { body: await response.text(), status: response.status };
  });
  expect(exportProbe.status).toBe(200);
  expect(exportProbe.body).toContain(privateTaskTitle);
  expect(exportProbe.body).toContain(account.email);

  const inventory = await inspectOpenTaskCaches(page, [privateTaskTitle, account.email]);
  expect(inventory.cacheNames).toHaveLength(1);
  expect(inventory.entryCount).toBeGreaterThanOrEqual(precachedPaths.length);
  expect(inventory.violations).toEqual([]);
  expect(inventory.paths).toEqual(expect.arrayContaining([...precachedPaths]));
  expect(inventory.paths.some((path) => path.startsWith("/api/"))).toBe(false);
});

test("missing and corrupt cached fallbacks degrade to the content-free emergency response", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One worker-corruption recovery path is sufficient.",
  );

  await page.goto("/");
  await waitForPwaControl(page);
  const cacheName = await currentOpenTaskCache(page);
  await page.evaluate(
    async ({ name, path }) => {
      const cache = await caches.open(name);
      await cache.delete(path);
    },
    { name: cacheName, path: "/offline.html" },
  );

  await context.setOffline(true);
  const missingPage = await context.newPage();
  const missingResponse = await missingPage.goto("/today", { waitUntil: "domcontentloaded" });
  expect(missingResponse?.status()).toBe(503);
  await expect(
    missingPage.locator('body[data-opentask-offline-fallback="emergency-content-free"]'),
  ).toBeVisible();
  await expect(missingPage.getByText(/No account or task data is stored in this fallback/u)).toBeVisible();
  await missingPage.close();

  const corruptSentinel = `P5 corrupt fallback ${randomUUID()}`;
  await page.evaluate(
    async ({ body, name }) => {
      const cache = await caches.open(name);
      await cache.put(
        "/offline.html",
        new Response(JSON.stringify({ body }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    },
    { body: corruptSentinel, name: cacheName },
  );

  const corruptPage = await context.newPage();
  const corruptResponse = await corruptPage.goto("/today", { waitUntil: "domcontentloaded" });
  expect(corruptResponse?.status()).toBe(503);
  await expect(
    corruptPage.locator('body[data-opentask-offline-fallback="emergency-content-free"]'),
  ).toBeVisible();
  await expect(corruptPage.getByText(corruptSentinel, { exact: true })).toHaveCount(0);
  await expectNoSeriousViolations(corruptPage);
  await expectNoHorizontalOverflow(corruptPage);
});

test("standalone display state remains clear, accessible, and responsive in Settings", async ({
  page,
}, testInfo) => {
  test.skip(
    !interactiveProjects.has(testInfo.project.name),
    "The standalone Settings state runs at desktop and mobile widths.",
  );

  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query);
      if (query !== "(display-mode: standalone)") return result;
      return new Proxy(result, {
        get(target, property, receiver) {
          if (property === "matches") return true;
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    };
  });

  await signUpThroughUi(page, testInfo, { returnTo: "/settings" });
  await expect(page.getByRole("heading", { name: "App and reminders", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Installed" })).toBeVisible();
  await expect(page.getByText("OpenTask is installed on this device.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Install OpenTask" })).toHaveCount(0);
  await expect(page.getByText(/does not store your tasks for offline editing/u)).toBeVisible();
  await expectNoSeriousViolations(page);
  await expectNoHorizontalOverflow(page);
});

async function waitForPwaControl(page: Page) {
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.waitForFunction(
    () => {
      const scriptUrl = navigator.serviceWorker.controller?.scriptURL;
      return scriptUrl ? new URL(scriptUrl).pathname === "/sw.js" : false;
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    async (paths) => {
      const names = (await caches.keys()).filter((name) => name.startsWith("opentask-static-"));
      if (names.length !== 1) return false;
      const cache = await caches.open(names[0]!);
      const requests = await cache.keys();
      const stored = new Set(requests.map((request) => new URL(request.url).pathname));
      return paths.every((path) => stored.has(path));
    },
    [...precachedPaths],
    { timeout: 20_000 },
  );

  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      scope: registration.scope,
      scriptUrl: registration.active?.scriptURL ?? navigator.serviceWorker.controller?.scriptURL ?? null,
    };
  });
}

async function currentOpenTaskCache(page: Page) {
  const names = await page.evaluate(async () =>
    (await caches.keys()).filter((name) => name.startsWith("opentask-static-")),
  );
  expect(names).toHaveLength(1);
  return names[0]!;
}

async function inspectOpenTaskCaches(page: Page, privateSentinels: readonly string[]) {
  return page.evaluate(
    async ({ allowedPublicPaths, sentinels }) => {
      const allowed = new Set<string>(allowedPublicPaths);
      const cacheNames = (await caches.keys()).filter((name) => name.startsWith("opentask-static-"));
      const violations: string[] = [];
      const paths: string[] = [];
      let entryCount = 0;

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          entryCount += 1;
          const url = new URL(request.url);
          paths.push(url.pathname);
          const response = await cache.match(request);
          const contentType = response?.headers.get("content-type")?.toLowerCase() ?? "";
          const publicStatic = allowed.has(url.pathname) || url.pathname.startsWith("/_next/static/");

          if (url.origin !== location.origin) violations.push(`cross-origin:${url.href}`);
          if (request.method !== "GET") violations.push(`method:${request.method}:${url.pathname}`);
          if (!publicStatic) violations.push(`private-path:${url.pathname}`);
          if (url.pathname.startsWith("/api/")) violations.push(`api:${url.pathname}`);
          if (contentType.includes("text/html") && url.pathname !== "/offline.html") {
            violations.push(`html:${url.pathname}`);
          }
          if (response?.headers.has("set-cookie")) violations.push(`set-cookie:${url.pathname}`);
          if (response?.headers.has("content-disposition")) {
            violations.push(`content-disposition:${url.pathname}`);
          }

          if (response && /(?:json|javascript|text\/|xml)/u.test(contentType)) {
            const body = await response.clone().text();
            for (const sentinel of sentinels) {
              if (body.includes(sentinel)) violations.push(`private-content:${url.pathname}`);
            }
          }
        }
      }

      return { cacheNames, entryCount, paths, violations };
    },
    { allowedPublicPaths: [...precachedPaths], sentinels: [...privateSentinels] },
  );
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length })),
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const overflowingControls = Array.from(
      document.querySelectorAll<HTMLElement>("a, button, input, select, textarea"),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      })
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      })
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName);

    return {
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      overflowingControls,
    };
  });

  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.overflowingControls).toEqual([]);
}

function readPngDimensions(body: Buffer) {
  expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { height: body.readUInt32BE(20), width: body.readUInt32BE(16) };
}

function parseManifestSize(size: string) {
  const match = /^(\d+)x(\d+)$/u.exec(size);
  if (!match) throw new Error(`Invalid manifest icon size: ${size}`);
  return { height: Number(match[2]), width: Number(match[1]) };
}

type WebAppManifest = Readonly<{
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  prefer_related_applications: boolean;
  icons: ReadonlyArray<Readonly<{ purpose: string; sizes: string; src: string; type: string }>>;
}>;

type BrowserManifestResult = Readonly<{
  data?: string;
  errors: readonly unknown[];
}>;

type BrowserInstallabilityResult = Readonly<{
  installabilityErrors: ReadonlyArray<Readonly<{ errorId: string }>>;
}>;
