import { randomUUID } from "node:crypto";

import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { installBrowserPushMock, readBrowserPushMock } from "./support/p6-browser-push";

const APP_ORIGIN = "http://127.0.0.1:3107";
const forbiddenExportKeys = new Set([
  "accessToken",
  "account",
  "auth",
  "authCiphertext",
  "deliveryId",
  "deliveries",
  "deviceLabel",
  "endpoint",
  "endpointCiphertext",
  "endpointHash",
  "encryptionKeyVersion",
  "idempotencyKey",
  "jobId",
  "lastErrorCode",
  "notificationDeliveries",
  "p256dh",
  "p256dhCiphertext",
  "password",
  "passwordHash",
  "provider",
  "providerResult",
  "pushSubscriptions",
  "queueName",
  "refreshToken",
  "serverConfiguration",
  "subscriptionId",
  "subscriptions",
  "token",
  "userAgentSummary",
  "vapidPrivateKey",
  "vapidPublicKey",
]);

test("isolated demo resets preserve the full portable release without operational push state", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop production proof owns G9.");
  test.setTimeout(90_000);

  await installBrowserPushMock(page);
  const clientAddress = isolatedClientAddress();
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto("/");

  const createdResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/demo" && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo", exact: true }).click();
  const createdResponse = await createdResponsePromise;
  expect(createdResponse.status()).toBe(200);
  await expect(page).toHaveURL("/inbox");

  await assertProviderAbsentSettings(page);
  const first = await readReleaseExport(page);
  assertFullDemoRelease(first);
  const stableFixture = fixtureIdentity(first);

  const firstReset = await resetDemo(page, clientAddress);
  expect(firstReset.headers()["set-cookie"]).toBeUndefined();
  await expect(firstReset.json()).resolves.toEqual({ mode: "reset", redirectTo: "/inbox" });
  const afterFirstReset = await readReleaseExport(page);
  assertFullDemoRelease(afterFirstReset);
  expect(fixtureIdentity(afterFirstReset)).toEqual(stableFixture);

  const secondReset = await resetDemo(page, clientAddress);
  expect(secondReset.headers()["set-cookie"]).toBeUndefined();
  await expect(secondReset.json()).resolves.toEqual({ mode: "reset", redirectTo: "/inbox" });
  const afterSecondReset = await readReleaseExport(page);
  assertFullDemoRelease(afterSecondReset);
  expect(fixtureIdentity(afterSecondReset)).toEqual(stableFixture);
  expect(afterSecondReset.identity.profile.id).toBe(first.identity.profile.id);
  expect(afterSecondReset.identity.profile.email).toBe(first.identity.profile.email);

  // The DB integration suite owns internal row counts. Browser evidence proves reset never enrolls
  // this browser and the only portable notification fact remains the one reminder specification.
  await page.goto("/settings");
  await assertProviderAbsentSettings(page);
  expect(await readBrowserPushMock(page)).toMatchObject({
    permission: "default",
    permissionRequests: 0,
    subscribeCalls: 0,
    subscribed: false,
  });
});

async function assertProviderAbsentSettings(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const panel = page.locator('[aria-labelledby="push-reminders-title"]');
  await expect(panel.getByRole("status").filter({ hasText: "Unavailable" })).toBeVisible();
  await expect(
    panel.getByText("This server has not configured browser reminders.", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Enable in this browser", exact: true })).toBeDisabled();
  expect((await readBrowserPushMock(page)).permissionRequests).toBe(0);
}

async function resetDemo(page: Page, clientAddress: string) {
  return page.context().request.post("/api/v1/demo", {
    data: {},
    headers: { origin: APP_ORIGIN, "x-real-ip": clientAddress },
  });
}

async function readReleaseExport(page: Page): Promise<UserExportEnvelope> {
  const response = await page.context().request.get("/api/v1/export");
  assertPrivateExportResponse(response);
  // The server validates the canonical strict Zod envelope before returning 200; G4 and DB suites
  // own the exhaustive field matrix. G9 reads only the relationships needed for release evidence.
  return (await response.json()) as UserExportEnvelope;
}

function assertPrivateExportResponse(response: APIResponse) {
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["x-opentask-export-schema-version"]).toBe("5");
}

function assertFullDemoRelease(envelope: UserExportEnvelope) {
  expect(envelope).toMatchObject({
    schemaVersion: 5,
    identity: { schemaVersion: 1 },
    tasks: { schemaVersion: 2 },
    habits: { schemaVersion: 1 },
    focus: { schemaVersion: 1 },
    notifications: { schemaVersion: 1 },
    assistant: { schemaVersion: 1 },
  });
  expect(envelope.tasks.recurrenceDefinitions.length).toBeGreaterThan(0);
  expect(envelope.tasks.occurrenceEvents.length).toBeGreaterThan(0);
  expect(envelope.habits.habits.length).toBeGreaterThan(0);
  expect(envelope.habits.schedules.length).toBe(envelope.habits.habits.length);
  expect(envelope.habits.logs.length).toBeGreaterThan(0);
  expect(envelope.focus.sessions).toHaveLength(2);
  expect(envelope.notifications.reminders).toHaveLength(1);

  const taskIds = new Set(envelope.tasks.tasks.map(({ id }) => id));
  const habitIds = new Set(envelope.habits.habits.map(({ id }) => id));
  for (const definition of envelope.tasks.recurrenceDefinitions)
    expect(taskIds.has(definition.taskId)).toBe(true);
  for (const event of envelope.tasks.occurrenceEvents) expect(taskIds.has(event.taskId)).toBe(true);
  for (const schedule of envelope.habits.schedules) expect(habitIds.has(schedule.habitId)).toBe(true);
  for (const log of envelope.habits.logs) expect(habitIds.has(log.habitId)).toBe(true);
  for (const session of envelope.focus.sessions) {
    if (session.taskId) expect(taskIds.has(session.taskId)).toBe(true);
    if (session.habitId) expect(habitIds.has(session.habitId)).toBe(true);
    expect(Date.parse(session.endedAt)).toBeGreaterThanOrEqual(Date.parse(session.startedAt));
  }

  const [reminder] = envelope.notifications.reminders;
  expect(reminder).toMatchObject({
    enabled: true,
    version: 1,
    spec: { kind: "absolute", offsetMinutes: null },
  });
  expect(taskIds.has(reminder!.taskId)).toBe(true);
  expect(envelope.focus.sessions.some(({ taskId }) => taskId === reminder!.taskId)).toBe(true);
  expect(Object.keys(envelope.notifications).sort()).toEqual(["reminders", "schemaVersion"]);

  const exportedKeys = new Set(allKeys(envelope));
  for (const key of forbiddenExportKeys)
    expect(exportedKeys.has(key), `forbidden export key: ${key}`).toBe(false);
}

function fixtureIdentity(envelope: UserExportEnvelope) {
  const ids = (rows: readonly Readonly<{ id: string }>[]) => rows.map(({ id }) => id).sort();
  return {
    profile: envelope.identity.profile.id,
    folders: ids(envelope.tasks.folders),
    lists: ids(envelope.tasks.lists),
    sections: ids(envelope.tasks.sections),
    tasks: ids(envelope.tasks.tasks),
    checklistItems: ids(envelope.tasks.checklistItems),
    tags: ids(envelope.tasks.tags),
    occurrenceEvents: ids(envelope.tasks.occurrenceEvents),
    recurrenceTasks: envelope.tasks.recurrenceDefinitions.map(({ taskId }) => taskId).sort(),
    taskSchedules: envelope.tasks.schedules.map(({ taskId }) => taskId).sort(),
    habits: ids(envelope.habits.habits),
    habitSchedules: envelope.habits.schedules.map(({ habitId }) => habitId).sort(),
    habitLogs: ids(envelope.habits.logs),
    focusSessions: ids(envelope.focus.sessions),
    reminders: envelope.notifications.reminders.map(({ id, taskId }) => `${id}:${taskId}`).sort(),
  };
}

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)]);
}

function isolatedClientAddress() {
  const seed = randomUUID().replaceAll("-", "");
  return `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
}

type Identified = Readonly<{ id: string }>;

type UserExportEnvelope = Readonly<{
  schemaVersion: number;
  identity: Readonly<{
    schemaVersion: number;
    profile: Readonly<{ id: string; email: string }>;
  }>;
  tasks: Readonly<{
    schemaVersion: number;
    folders: readonly Identified[];
    lists: readonly Identified[];
    sections: readonly Identified[];
    tasks: readonly Identified[];
    schedules: readonly Readonly<{ taskId: string }>[];
    recurrenceDefinitions: readonly Readonly<{ taskId: string }>[];
    occurrenceEvents: readonly Readonly<{ id: string; taskId: string }>[];
    checklistItems: readonly Identified[];
    tags: readonly Identified[];
  }>;
  habits: Readonly<{
    schemaVersion: number;
    habits: readonly Identified[];
    schedules: readonly Readonly<{ habitId: string }>[];
    logs: readonly Readonly<{ id: string; habitId: string }>[];
  }>;
  focus: Readonly<{
    schemaVersion: number;
    sessions: readonly Readonly<{
      id: string;
      taskId: string | null;
      habitId: string | null;
      startedAt: string;
      endedAt: string;
    }>[];
  }>;
  notifications: Readonly<{
    schemaVersion: number;
    reminders: readonly Readonly<{
      id: string;
      taskId: string;
      enabled: boolean;
      version: number;
      spec: Readonly<{ kind: "absolute" | "relative_start"; offsetMinutes: number | null }>;
    }>[];
  }>;
  assistant: Readonly<{ schemaVersion: number }>;
}>;
