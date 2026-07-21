import { randomUUID } from "node:crypto";

import {
  expect,
  type APIResponse,
  type Page,
  type Response,
  type Route,
  type TestInfo,
} from "@playwright/test";

const APP_ORIGIN = "http://127.0.0.1:3107";

export const demoHabits = {
  activeBooleanId: "71000000-0000-4000-8000-000000000001",
  activeBooleanTitle: "Morning reset",
  activeNumericId: "71000000-0000-4000-8000-000000000002",
  activeNumericTitle: "Drink water",
  activeWeeklyId: "71000000-0000-4000-8000-000000000003",
  activeWeeklyTitle: "Move with intention",
  archivedId: "71000000-0000-4000-8000-000000000004",
  archivedTitle: "Read before bed",
} as const;

export type HabitScheduleWire =
  | Readonly<{
      kind: "daily";
      weekdays: null;
      targetPerWeek: null;
      timezone: string;
      startDate: string;
      endDate: string | null;
    }>
  | Readonly<{
      kind: "weekdays";
      weekdays: readonly number[];
      targetPerWeek: null;
      timezone: string;
      startDate: string;
      endDate: string | null;
    }>
  | Readonly<{
      kind: "weekly_target";
      weekdays: null;
      targetPerWeek: number;
      timezone: string;
      startDate: string;
      endDate: string | null;
    }>;

export type HabitCreateInput = Readonly<{
  title: string;
  icon: string;
  colorToken: "coral" | "amber" | "mint" | "sky" | "violet" | "slate";
  goal:
    | Readonly<{ goalKind: "boolean"; targetValue: null; unit: null }>
    | Readonly<{ goalKind: "quantity"; targetValue: number; unit: string }>;
  schedule: HabitScheduleWire;
}>;

export type HabitDetailWire = Readonly<{
  habit: Readonly<{
    id: string;
    title: string;
    icon: string;
    colorToken: string;
    goal: HabitCreateInput["goal"];
    version: number;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
  }>;
  schedule: Readonly<{
    habitId: string;
    schedule: HabitScheduleWire;
    createdAt: string;
    updatedAt: string;
  }>;
}>;

export type HabitLogWire = Readonly<{
  id: string;
  habitId: string;
  localDate: string;
  state: "completed" | "skipped" | "unachieved";
  quantity: number | null;
  note: string | null;
  successful: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export async function enterHabitDemo(page: Page, testInfo: TestInfo) {
  const seed = randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  let response: Awaited<ReturnType<typeof waitForHabitResponse>> | undefined;
  for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
    await page.goto("/");
    const responsePromise = waitForHabitResponse(page, "/api/v1/demo", "POST", 30_000);
    await page.getByRole("button", { name: "Try demo" }).click();
    response = await responsePromise.catch(() => undefined);
  }
  expect(response, `${testInfo.project.name} demo request`).toBeDefined();
  if (!response) throw new Error("The demo request was not observed after a safe page retry.");
  expect(response.status(), `${testInfo.project.name} demo entry`).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
}

export async function readHabitLocalDate(page: Page, timezone: string): Promise<string> {
  const response = await page.context().request.get("/api/v1/habits/today?limit=1");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    boundaries?: readonly { timezone?: unknown; localDate?: unknown }[];
  };
  const boundary = body.boundaries?.find((candidate) => candidate.timezone === timezone);
  if (boundary) {
    expect(boundary.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    return boundary.localDate as string;
  }

  const serverDate = response.headers().date;
  const instant = serverDate ? new Date(serverDate) : new Date();
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const localDate = `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
  expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  return localDate;
}

export async function createHabitViaApi(
  page: Page,
  input: HabitCreateInput,
  id = randomUUID(),
): Promise<HabitDetailWire> {
  const response = await page.context().request.post("/api/v1/habits", {
    data: input,
    headers: mutationHeaders({ "idempotency-key": id }),
  });
  expect(response.status()).toBe(201);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers().location).toBe(`/api/v1/habits/${id}`);
  const body = (await response.json()) as HabitDetailWire;
  expect(body).toMatchObject({
    habit: { id, title: input.title, goal: input.goal, version: 1, archivedAt: null },
    schedule: { habitId: id, schedule: input.schedule },
  });
  return body;
}

export async function createHabitThroughUi(page: Page, input: HabitCreateInput): Promise<HabitDetailWire> {
  await page.getByRole("button", { name: "Create habit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create habit" });
  await dialog.getByLabel("Title", { exact: true }).fill(input.title);
  await dialog.getByLabel("Icon or emoji", { exact: true }).fill(input.icon);
  await dialog.getByRole("combobox", { name: "Category", exact: true }).selectOption(input.colorToken);

  if (input.goal.goalKind === "quantity") {
    await dialog.getByRole("radio", { name: "Track a quantity" }).check();
    await dialog.getByLabel("Target quantity", { exact: true }).fill(String(input.goal.targetValue));
    await dialog.getByLabel("Unit", { exact: true }).fill(input.goal.unit);
  } else {
    await dialog.getByRole("radio", { name: "Check in once" }).check();
  }

  await dialog.getByRole("combobox", { name: "Schedule", exact: true }).selectOption(input.schedule.kind);
  if (input.schedule.kind === "weekdays") {
    const weekdayOptions = [
      ["Monday", 1],
      ["Tuesday", 2],
      ["Wednesday", 3],
      ["Thursday", 4],
      ["Friday", 5],
      ["Saturday", 6],
      ["Sunday", 7],
    ] as const;
    for (const [label, value] of weekdayOptions) {
      await dialog
        .getByRole("checkbox", { name: label, exact: true })
        .setChecked(input.schedule.weekdays.includes(value));
    }
  }
  if (input.schedule.kind === "weekly_target") {
    await dialog
      .getByLabel("Successful days per week", { exact: true })
      .fill(String(input.schedule.targetPerWeek));
  }
  await dialog.getByLabel("Start date", { exact: true }).fill(input.schedule.startDate);
  if (input.schedule.endDate) {
    await dialog.getByLabel(/End date/u).fill(input.schedule.endDate);
  }
  await dialog.getByLabel("Timezone", { exact: true }).fill(input.schedule.timezone);

  const responsePromise = waitForHabitResponse(page, "/api/v1/habits", "POST");
  await dialog.getByRole("button", { name: "Create habit", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  return (await response.json()) as HabitDetailWire;
}

export async function updateHabitViaApi(
  page: Page,
  habitId: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
): Promise<HabitDetailWire> {
  const response = await page.context().request.patch(`/api/v1/habits/${habitId}`, {
    data: { expectedVersion, patch },
    headers: mutationHeaders(),
  });
  return readSuccessfulJson<HabitDetailWire>(response);
}

export async function recordHabitViaApi(
  page: Page,
  habitId: string,
  localDate: string,
  value: Readonly<{
    state: "completed" | "skipped" | "unachieved";
    quantity: number | null;
    note: string | null;
  }>,
  id = randomUUID(),
): Promise<HabitLogWire> {
  const response = await page.context().request.post(`/api/v1/habits/${habitId}/logs`, {
    data: { localDate, value },
    headers: mutationHeaders({ "idempotency-key": id }),
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { outcome: string; log: HabitLogWire };
  expect(body).toMatchObject({ outcome: "created", log: { id, habitId, localDate, ...value, version: 1 } });
  return body.log;
}

export function waitForHabitResponse(
  page: Page,
  pathname: string | RegExp,
  method: "PATCH" | "POST",
  timeout?: number,
) {
  const predicate = (response: Response) => {
    const request = response.request();
    const actualPath = new URL(response.url()).pathname;
    return (
      request.method() === method &&
      (typeof pathname === "string" ? actualPath === pathname : pathname.test(actualPath))
    );
  };

  return timeout === undefined
    ? page.waitForResponse(predicate)
    : page.waitForResponse(predicate, { timeout });
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
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
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      overflowingControls,
    };
  });
  expect(layout.document, `${label} document overflow`).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.body, `${label} body overflow`).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.overflowingControls, `${label} controls outside viewport`).toEqual([]);
}

export async function installHabitApiFailure(page: Page, pathname: string): Promise<() => Promise<void>> {
  const pattern = "**/api/v1/habits/**";
  const handler = async (route: Route) => {
    if (new URL(route.request().url()).pathname !== pathname) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:opentask:problem:internal",
        title: "Habit request unavailable",
        status: 500,
        code: "INTERNAL",
        detail: "The habit evidence request failed safely.",
        correlationId: "p3-habit-state-evidence",
      }),
    });
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
}

export async function triggerStaleHabitRefresh(page: Page): Promise<void> {
  await page.evaluate(() => {
    const shiftedNow = Date.now() + 36 * 60 * 60 * 1_000;
    Date.now = () => shiftedNow;
    window.dispatchEvent(new Event("focus"));
  });
}

export function mutationHeaders(extra?: Record<string, string>) {
  return { origin: APP_ORIGIN, ...extra };
}

async function readSuccessfulJson<T>(response: APIResponse): Promise<T> {
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
}
