import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { enterWorkspaceThroughUi } from "./support/wp01-auth";
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
  "session",
  "token",
] as const;

test("a private versioned export is downloadable and excludes credentials", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    !goldenPathProjects.has(testInfo.project.name),
    "The G4 export and privacy path runs at desktop and mobile widths.",
  );

  const owner = await enterWorkspaceThroughUi(page, testInfo);
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
  await setAllDaySchedule(page, task.id, task.version);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
  await expect(page.getByText(/Passwords, sessions, provider keys, and raw brain dumps/u)).toBeVisible();
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
  expect(exportResponse.headers()["x-omplish-export-schema-version"]).toBe("1");

  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const envelope = JSON.parse(await readFile(downloadedPath!, "utf8")) as PortableExportEnvelope;
  const expectedFilename = `omplish-export-${new Date(envelope.exportedAt).toISOString().slice(0, 10)}.json`;
  expect(exportResponse.headers()["content-disposition"]).toBe(`attachment; filename="${expectedFilename}"`);
  expect(download.suggestedFilename()).toBe(expectedFilename);
  await expect(page.getByText(`Downloaded ${expectedFilename} · schema v1.`)).toBeVisible();
  expect(envelope).toMatchObject({
    schemaVersion: 1,
    identity: {
      schemaVersion: 1,
      profile: { email: owner.email },
      preferences: { schemaVersion: 2, timezone: expect.any(String) },
    },
    tasks: { schemaVersion: 1 },
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

  const serializedOwnerExport = JSON.stringify(envelope);
  expect(serializedOwnerExport).not.toContain(owner.password);
  for (const cookie of await page.context().cookies())
    expect(serializedOwnerExport).not.toContain(cookie.value);
  const exportedKeys = new Set(allKeys(envelope));
  for (const key of forbiddenExportKeys) expect(exportedKeys.has(key)).toBe(false);
});

test("export failure and offline state remain explicit without producing a file", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop recovery path is sufficient.");

  await enterWorkspaceThroughUi(page, testInfo, { returnTo: "/settings" });
  await page.route("**/api/v1/export", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:omplish:problem:internal",
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
    tags: ReadonlyArray<Record<string, unknown>>;
  };
  assistant: { schemaVersion: number; proposals: readonly unknown[] };
}>;

async function setAllDaySchedule(page: Page, taskId: string, version: number) {
  const response = await page.context().request.patch(`/api/v1/tasks/${taskId}/schedule`, {
    data: {
      expectedVersion: version,
      schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
    },
    headers: { origin: appOrigin },
  });
  expect(response.status()).toBe(200);
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
