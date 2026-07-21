import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { openVisibleAccountMenu, signUpThroughUi } from "./support/wp01-auth";
import { addTagToTask, createRegularList, createSection, createTask, updateTask } from "./support/wp03-tasks";

const appOrigin = "http://127.0.0.1:3107";
const goldenPathProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const forbiddenExportKeys = [
  "accessToken",
  "account",
  "apiKey",
  "applyToken",
  "idempotencyKey",
  "password",
  "providerPayload",
  "rawBrainDump",
  "refreshToken",
  "serverConfiguration",
  "subscriptionId",
  "endpoint",
  "endpointHash",
  "endpointCiphertext",
  "p256dh",
  "p256dhCiphertext",
  "auth",
  "authCiphertext",
  "encryptionKeyVersion",
  "deviceLabel",
  "userAgentSummary",
  "deliveryId",
  "lastErrorCode",
  "providerResult",
  "vapidPublicKey",
  "vapidPrivateKey",
  "jobId",
  "queueName",
  "session",
  "token",
] as const;

test("a private versioned export is downloadable, owner-scoped, and revoked on sign-out", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    !goldenPathProjects.has(testInfo.project.name),
    "The G4 export and privacy path runs at desktop and mobile widths.",
  );

  const owner = await signUpThroughUi(page, testInfo);
  const list = await createRegularList(page, "G4 private release list");
  const section = await createSection(page, list.id, "Owner-only section");
  let task = await createTask(page, {
    listId: list.id,
    sectionId: section.id,
    title: "G4 owner-only portable task",
    priority: "high",
  });
  task = await updateTask(page, task, {
    descriptionMd: "## Private export proof\n\nOwner-only portable description.",
  });
  task = await addTagToTask(page, task, "G4 private tag");
  const scheduled = await setAllDaySchedule(page, task.id, task.version);
  const recurrence = await setDailyRecurrence(page, task.id, scheduled.task.version);
  const occurrence = await readRecurringOccurrence(page, task.id);
  await completeOccurrence(page, task.id, occurrence.occurrenceKey, recurrence.task.version);
  const reminder = await setRelativeReminder(page, task.id);
  const portableHabit = await createPortableHabit(page);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
  await expect(
    page.getByRole("main").getByText(/Passwords, sessions, provider keys, and raw brain dumps/u),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const exportResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/export" && response.request().method() === "GET",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).click();
  const [exportResponse, download] = await Promise.all([exportResponsePromise, downloadPromise]);

  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["cache-control"]).toBe("private, no-store");
  expect(exportResponse.headers()["content-type"]).toContain("application/json");
  expect(exportResponse.headers()["pragma"]).toBe("no-cache");
  expect(exportResponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect(exportResponse.headers()["x-opentask-export-schema-version"]).toBe("5");

  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const envelope = JSON.parse(await readFile(downloadedPath!, "utf8")) as PortableExportEnvelope;
  const expectedFilename = `opentask-export-${new Date(envelope.exportedAt).toISOString().slice(0, 10)}.json`;
  expect(exportResponse.headers()["content-disposition"]).toBe(`attachment; filename="${expectedFilename}"`);
  expect(download.suggestedFilename()).toBe(expectedFilename);
  await expect(page.getByText(`Downloaded ${expectedFilename} · schema v5.`)).toBeVisible();
  expect(envelope).toMatchObject({
    schemaVersion: 5,
    identity: {
      schemaVersion: 1,
      profile: { email: owner.email },
      preferences: { schemaVersion: 1, timezone: expect.any(String) },
    },
    tasks: { schemaVersion: 2 },
    habits: { schemaVersion: 1 },
    focus: { schemaVersion: 1, sessions: [] },
    notifications: { schemaVersion: 1 },
    assistant: { schemaVersion: 1, proposals: expect.any(Array) },
  });
  expect(Number.isNaN(Date.parse(envelope.exportedAt))).toBe(false);
  expect(envelope.tasks.lists).toContainEqual(expect.objectContaining({ id: list.id, name: list.name }));
  expect(envelope.tasks.sections).toContainEqual(
    expect.objectContaining({ id: section.id, listId: list.id, name: section.name }),
  );
  expect(envelope.tasks.tasks).toContainEqual(
    expect.objectContaining({
      id: task.id,
      listId: list.id,
      sectionId: section.id,
      title: task.title,
      descriptionMd: "## Private export proof\n\nOwner-only portable description.",
      priority: "high",
    }),
  );
  expect(envelope.tasks.schedules).toContainEqual({
    taskId: task.id,
    kind: "all_day",
    startDate: "2026-07-21",
    endDate: "2026-07-22",
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
  expect(envelope.tasks.tags).toContainEqual(expect.objectContaining({ name: "G4 private tag" }));
  expect(envelope.tasks.recurrenceDefinitions).toContainEqual(
    expect.objectContaining({
      taskId: task.id,
      kind: "all_day",
      generationMode: "schedule",
      rrule: "FREQ=DAILY;INTERVAL=1",
      projectionStartDate: "2026-07-21",
      projectionEndDate: null,
    }),
  );
  expect(envelope.tasks.occurrenceEvents).toContainEqual(
    expect.objectContaining({
      taskId: task.id,
      occurrenceKey: occurrence.occurrenceKey,
      state: "completed",
      taskVersion: recurrence.task.version + 1,
    }),
  );
  expect(envelope.habits.habits).toContainEqual(
    expect.objectContaining({
      id: portableHabit.id,
      title: portableHabit.title,
      goalKind: "quantity",
      targetValue: 20,
      unit: "minutes",
    }),
  );
  expect(envelope.habits.schedules).toContainEqual(
    expect.objectContaining({
      habitId: portableHabit.id,
      kind: "daily",
      timezone: "UTC",
      startDate: portableHabit.localDate,
    }),
  );
  expect(envelope.habits.logs).toContainEqual(
    expect.objectContaining({
      id: portableHabit.logId,
      habitId: portableHabit.id,
      localDate: portableHabit.localDate,
      state: "completed",
      quantity: 24.5,
      note: portableHabit.note,
    }),
  );
  expect(envelope.notifications.reminders).toContainEqual({
    id: reminder.id,
    taskId: task.id,
    enabled: true,
    version: reminder.version,
    spec: { kind: "relative_start", remindAt: null, offsetMinutes: 30 },
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  });

  const serializedOwnerExport = JSON.stringify(envelope);
  expect(serializedOwnerExport).not.toContain(owner.password);
  for (const cookie of await page.context().cookies())
    expect(serializedOwnerExport).not.toContain(cookie.value);
  const exportedKeys = new Set(allKeys(envelope));
  for (const key of forbiddenExportKeys) expect(exportedKeys.has(key)).toBe(false);

  const { menu } = await openVisibleAccountMenu(page);
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");

  const signedOutExport = await page.context().request.get("/api/v1/export");
  expect(signedOutExport.status()).toBe(401);
  expect(await signedOutExport.text()).not.toContain(task.title);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/settings");

  const otherUser = await signUpThroughUi(page, testInfo, { returnTo: "/settings" });
  const otherExportResponse = await page.context().request.get("/api/v1/export");
  const otherEnvelope = await readSuccessfulExport(otherExportResponse);
  const serializedOtherExport = JSON.stringify(otherEnvelope);
  expect(otherEnvelope.identity.profile.email).toBe(otherUser.email);
  expect(serializedOtherExport).not.toContain(owner.email);
  expect(serializedOtherExport).not.toContain(task.id);
  expect(serializedOtherExport).not.toContain(task.title);
  expect(serializedOtherExport).not.toContain(list.id);
  expect(serializedOtherExport).not.toContain(portableHabit.id);
  expect(serializedOtherExport).not.toContain(portableHabit.title);
  expect(serializedOtherExport).not.toContain(portableHabit.note);
  expect(serializedOtherExport).not.toContain(reminder.id);

  const crossUserTask = await page.context().request.get(`/api/v1/tasks/${task.id}`);
  expect(crossUserTask.status()).toBe(404);
  expect(await crossUserTask.text()).not.toContain(task.title);
});

test("export failure and offline state remain explicit without producing a file", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop recovery path is sufficient.");

  await signUpThroughUi(page, testInfo, { returnTo: "/settings" });
  await page.route("**/api/v1/export", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:opentask:problem:internal",
        title: "Export unavailable",
        status: 503,
        code: "INTERNAL",
        detail: "The export could not be generated safely.",
        correlationId: "g4-export-failure",
      }),
    });
  });
  await page.getByRole("button", { name: "Export my data" }).click();
  await expect(
    page.getByText("No export file was downloaded. Check your connection and try again."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export my data" })).toBeEnabled();
  await page.unroute("**/api/v1/export");

  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(page.getByText("Offline · reconnect before requesting an export.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export my data" })).toBeDisabled();
  await context.setOffline(false);
});

type PortableExportEnvelope = Readonly<{
  schemaVersion: number;
  exportedAt: string;
  identity: {
    schemaVersion: number;
    profile: { id: string; email: string };
    preferences: { schemaVersion: number; timezone: string };
  };
  tasks: {
    schemaVersion: number;
    lists: ReadonlyArray<{ id: string; name: string }>;
    sections: ReadonlyArray<{ id: string; listId: string; name: string }>;
    tasks: ReadonlyArray<Record<string, unknown>>;
    schedules: ReadonlyArray<Record<string, unknown>>;
    recurrenceDefinitions: ReadonlyArray<Record<string, unknown>>;
    occurrenceEvents: ReadonlyArray<Record<string, unknown>>;
    tags: ReadonlyArray<Record<string, unknown>>;
  };
  habits: {
    schemaVersion: number;
    habits: ReadonlyArray<Record<string, unknown>>;
    schedules: ReadonlyArray<Record<string, unknown>>;
    logs: ReadonlyArray<Record<string, unknown>>;
  };
  focus: {
    schemaVersion: number;
    sessions: ReadonlyArray<Record<string, unknown>>;
  };
  notifications: {
    schemaVersion: number;
    reminders: ReadonlyArray<PortableReminder>;
  };
  assistant: { schemaVersion: number; proposals: readonly unknown[] };
}>;

type PortableReminder = Readonly<{
  id: string;
  taskId: string;
  enabled: boolean;
  version: number;
  spec:
    | { kind: "absolute"; remindAt: string; offsetMinutes: null }
    | { kind: "relative_start"; remindAt: null; offsetMinutes: number };
  createdAt: string;
  updatedAt: string;
}>;

async function createPortableHabit(page: Page) {
  const id = randomUUID();
  const logId = randomUUID();
  const title = "G4 owner-only reading habit";
  const note = "G4 owner-only habit note";
  const localDate = new Date().toISOString().slice(0, 10);
  const createResponse = await page.context().request.post("/api/v1/habits", {
    data: {
      title,
      icon: "📚",
      colorToken: "violet",
      goal: { goalKind: "quantity", targetValue: 20, unit: "minutes" },
      schedule: {
        kind: "daily",
        weekdays: null,
        targetPerWeek: null,
        timezone: "UTC",
        startDate: localDate,
        endDate: null,
      },
    },
    headers: { origin: appOrigin, "idempotency-key": id },
  });
  expect(createResponse.status()).toBe(201);

  const logResponse = await page.context().request.post(`/api/v1/habits/${id}/logs`, {
    data: {
      localDate,
      value: { state: "completed", quantity: 24.5, note },
    },
    headers: { origin: appOrigin, "idempotency-key": logId },
  });
  expect(logResponse.status()).toBe(201);
  return { id, logId, localDate, note, title } as const;
}

async function setAllDaySchedule(page: Page, taskId: string, version: number) {
  const response = await page.context().request.patch(`/api/v1/tasks/${taskId}/schedule`, {
    data: {
      expectedVersion: version,
      schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
    },
    headers: { origin: appOrigin },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as MutationResult;
}

async function setDailyRecurrence(page: Page, taskId: string, version: number) {
  const response = await page.context().request.patch(`/api/v1/tasks/${taskId}/recurrence`, {
    data: {
      expectedVersion: version,
      definition: {
        preset: { kind: "daily", interval: 1 },
        end: { kind: "never" },
      },
    },
    headers: { origin: appOrigin },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as MutationResult;
}

async function readRecurringOccurrence(page: Page, taskId: string) {
  const response = await page
    .context()
    .request.get("/api/v1/planning/calendar?rangeStartDate=2026-07-21&rangeEndDate=2026-07-22&limit=20");
  expect(response.status()).toBe(200);
  const projection = (await response.json()) as CalendarProjection;
  const occurrence = projection.events.find(
    (event) => event.taskId === taskId && event.projectionLifecycle === "recurring_occurrence",
  );
  const occurrenceKey = occurrence?.occurrenceKey;
  if (!occurrence || !occurrenceKey) throw new Error("The export fixture recurrence did not project.");
  return { ...occurrence, occurrenceKey };
}

async function completeOccurrence(
  page: Page,
  taskId: string,
  occurrenceKey: string,
  expectedVersion: number,
) {
  const response = await page.context().request.post(`/api/v1/tasks/${taskId}/occurrences/transition`, {
    data: { action: "complete", occurrenceKey, expectedVersion },
    headers: { origin: appOrigin },
  });
  expect(response.status()).toBe(200);
}

async function setRelativeReminder(page: Page, taskId: string): Promise<PortableReminder> {
  const response = await page.context().request.put(`/api/v1/tasks/${taskId}/reminder`, {
    data: {
      id: randomUUID(),
      expectedVersion: null,
      enabled: true,
      spec: { kind: "relative_start", remindAt: null, offsetMinutes: 30 },
    },
    headers: { origin: appOrigin },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as PortableReminder;
}

type MutationResult = Readonly<{ task: Readonly<{ id: string; version: number }> }>;
type CalendarProjection = Readonly<{
  events: ReadonlyArray<
    Readonly<{
      taskId: string;
      projectionLifecycle: "one_off" | "recurring_occurrence";
      occurrenceKey: string | null;
    }>
  >;
}>;

async function readSuccessfulExport(response: APIResponse): Promise<PortableExportEnvelope> {
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return (await response.json()) as PortableExportEnvelope;
}

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
}
