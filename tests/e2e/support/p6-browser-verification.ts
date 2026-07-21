import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, type BrowserContext, type Page, type Worker } from "@playwright/test";

export function futureLocalInput(hours: number) {
  const value = new Date(Date.now() + hours * 60 * 60 * 1_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export async function captureP6Evidence(page: Page, project: string, state: string) {
  const directory = path.resolve("artifacts/visual-proof/p6/notifications");
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, `${state}-${project}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

export async function expectNoSeriousViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length })),
  ).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflowingControls: Array.from(
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
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName),
  }));
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.overflowingControls).toEqual([]);
}

export async function waitForPwaControl(page: Page) {
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.waitForFunction(
    () => {
      const scriptUrl = navigator.serviceWorker.controller?.scriptURL;
      return scriptUrl ? new URL(scriptUrl).pathname === "/sw.js" : false;
    },
    undefined,
    { timeout: 20_000 },
  );
}

export async function activeOpenTaskWorker(context: BrowserContext) {
  await expect
    .poll(() => context.serviceWorkers().length, { timeout: 20_000, message: "OpenTask service worker" })
    .toBeGreaterThan(0);
  const worker = context.serviceWorkers().find((candidate) => new URL(candidate.url()).pathname === "/sw.js");
  if (!worker) throw new Error("The active OpenTask service worker was not found.");
  return worker;
}

export async function dispatchPush(worker: Worker, payload: unknown) {
  return worker.evaluate(async (nextPayload) => {
    const scope = globalThis as unknown as {
      dispatchEvent(event: Event): boolean;
      registration: ServiceWorkerRegistration & {
        showNotification(title: string, options?: NotificationOptions): Promise<void>;
      };
    };
    const shown: Array<{
      body: string | undefined;
      data: unknown;
      tag: string | undefined;
      title: string;
    }> = [];
    const originalShowNotification = scope.registration.showNotification;
    Object.defineProperty(scope.registration, "showNotification", {
      configurable: true,
      value: async (title: string, options: NotificationOptions = {}) => {
        shown.push({ body: options.body, data: options.data as unknown, tag: options.tag, title });
      },
    });
    const pending: Promise<unknown>[] = [];
    const event = new Event("push");
    Object.defineProperties(event, {
      data: { value: { json: () => nextPayload } },
      waitUntil: { value: (promise: Promise<unknown>) => pending.push(promise) },
    });
    try {
      scope.dispatchEvent(event);
      await Promise.all(pending);
      return shown;
    } finally {
      Object.defineProperty(scope.registration, "showNotification", {
        configurable: true,
        value: originalShowNotification,
      });
    }
  }, payload);
}

export async function dispatchNotificationClick(worker: Worker, payload: unknown) {
  return worker.evaluate(async (nextPayload) => {
    const scope = globalThis as unknown as {
      clients: {
        matchAll(options?: unknown): Promise<readonly unknown[]>;
        openWindow(url: string): Promise<unknown>;
      };
      dispatchEvent(event: Event): boolean;
      location: Location;
    };
    const pending: Promise<unknown>[] = [];
    const navigations: string[] = [];
    const openedWindows: string[] = [];
    let focusCalls = 0;
    let closed = false;
    const originalMatchAll = scope.clients.matchAll;
    const originalOpenWindow = scope.clients.openWindow;
    Object.defineProperties(scope.clients, {
      matchAll: {
        configurable: true,
        value: async () => [
          {
            url: `${scope.location.origin}/settings`,
            focus: async () => {
              focusCalls += 1;
            },
            navigate: async (url: string) => {
              navigations.push(url);
              return null;
            },
          },
        ],
      },
      openWindow: {
        configurable: true,
        value: async (url: string) => {
          openedWindows.push(url);
          return null;
        },
      },
    });
    const event = new Event("notificationclick");
    Object.defineProperties(event, {
      notification: {
        value: {
          close: () => {
            closed = true;
          },
          data: nextPayload,
        },
      },
      waitUntil: { value: (promise: Promise<unknown>) => pending.push(promise) },
    });
    try {
      scope.dispatchEvent(event);
      await Promise.all(pending);
      return { closed, focusCalls, navigations, openedWindows };
    } finally {
      Object.defineProperties(scope.clients, {
        matchAll: { configurable: true, value: originalMatchAll },
        openWindow: { configurable: true, value: originalOpenWindow },
      });
    }
  }, payload);
}
