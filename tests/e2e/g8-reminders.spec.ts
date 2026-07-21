import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  configuredPushCapability,
  installBrowserPushMock,
  mockPushCapability,
  mockPushSubscriptionWrites,
  privatePushFixtureValues,
  readBrowserPushMock,
} from "./support/p6-browser-push";
import {
  activeOpenTaskWorker,
  captureP6Evidence,
  dispatchNotificationClick,
  dispatchPush,
  expectNoHorizontalOverflow,
  expectNoSeriousViolations,
  futureLocalInput,
  waitForPwaControl,
} from "./support/p6-browser-verification";
import {
  addLocalDays,
  configureTestTimeZone,
  localDateIn,
  setTaskSchedule,
} from "./support/golden-path-planning";
import { signUpThroughUi } from "./support/wp01-auth";
import { quickAddTask } from "./support/wp03-tasks";

const responsiveProjects = new Set(["desktop-chromium", "tablet-chromium", "mobile-chromium"]);
const taskInteractionProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const appOrigin = "http://127.0.0.1:3107";
const unconfiguredPushCapability = {
  provider: "unconfigured",
  storageEncryption: "unconfigured",
  worker: "unconfigured",
  vapidPublicKey: null,
} as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Settings requests permission only on action and supports reset, enrollment, and revoke", async ({
  page,
}, testInfo) => {
  test.skip(
    !responsiveProjects.has(testInfo.project.name),
    "The three required P6 widths own the configured browser-reminder contract.",
  );
  test.setTimeout(90_000);

  await installBrowserPushMock(page);
  await mockPushCapability(page);
  const writes = await mockPushSubscriptionWrites(page, [
    "subscription_reset_required",
    "subscribed",
    "subscribed",
  ]);
  await signUpThroughUi(page, testInfo, { returnTo: "/settings" });

  const panel = pushSettingsPanel(page);
  await expect(panel.getByRole("heading", { name: "Task reminders", exact: true })).toBeVisible();
  await expect(pushStatus(panel, "Not enabled")).toBeVisible();
  await expect(
    panel.getByText("The worker is configured, but this page cannot verify that it is running."),
  ).toBeVisible();
  expect((await readBrowserPushMock(page)).permissionRequests).toBe(0);

  const enable = panel.getByRole("button", { name: "Enable in this browser", exact: true });
  await expect(enable).toBeEnabled();
  await enable.click();
  await expect(pushStatus(panel, "Reset needed")).toBeVisible();
  await expect(panel.getByText(/already associated elsewhere/u)).toBeVisible();
  expect(await readBrowserPushMock(page)).toMatchObject({
    permission: "granted",
    permissionRequests: 1,
    subscribeCalls: 1,
    subscribed: true,
    unsubscribeCalls: 0,
  });

  const reset = panel.getByRole("button", {
    name: "Reset this browser subscription",
    exact: true,
  });
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(pushStatus(panel, "Enabled")).toBeVisible();
  await expect(panel.getByText("Task reminders are enabled in this browser.")).toBeVisible();
  expect(await readBrowserPushMock(page)).toMatchObject({
    permission: "granted",
    permissionRequests: 1,
    subscribeCalls: 2,
    subscribed: true,
    unsubscribeCalls: 1,
  });

  await page.reload();
  await expect(pushStatus(panel, "Verification needed")).toBeVisible();
  await expect(
    panel.getByText(
      "A local browser subscription exists, but its association with this account is not verified.",
    ),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Verify this browser", exact: true }).click();
  await expect(pushStatus(panel, "Enabled")).toBeVisible();

  expect(writes.registrations).toHaveLength(3);
  expect(writes.registrations[0]).toMatchObject({
    endpoint: privatePushFixtureValues().endpoint,
    keys: {
      auth: privatePushFixtureValues().auth,
      p256dh: privatePushFixtureValues().p256dh,
    },
  });
  expect(writes.registrations[1]).toMatchObject({
    endpoint: privatePushFixtureValues().endpoint,
  });
  expect(writes.registrations[2]).toMatchObject({
    endpoint: privatePushFixtureValues().endpoint,
  });
  expect(JSON.stringify(writes.registrations)).toMatch(
    /"id":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/u,
  );
  await expect(page.locator("body")).not.toContainText(privatePushFixtureValues().endpoint);
  await expect(page.locator("body")).not.toContainText(privatePushFixtureValues().p256dh);
  await expectNoSeriousViolations(page);
  await expectNoHorizontalOverflow(page);
  await captureP6Evidence(page, testInfo.project.name, "settings-configured");

  await panel.getByRole("button", { name: "Turn off in this browser", exact: true }).click();
  await expect(pushStatus(panel, "Not enabled")).toBeVisible();
  await expect(panel.getByText("Task reminders are off in this browser.")).toBeVisible();
  expect(writes.revocations).toEqual([{ endpoint: privatePushFixtureValues().endpoint }]);
  expect(await readBrowserPushMock(page)).toMatchObject({ subscribed: false, unsubscribeCalls: 2 });
});

for (const scenario of [
  {
    name: "unsupported browser",
    permission: "unsupported" as const,
    capability: configuredPushCapability,
    status: "Unsupported",
    description: "This browser does not support Web Push reminders.",
  },
  {
    name: "blocked permission",
    permission: "denied" as const,
    capability: configuredPushCapability,
    status: "Permission blocked",
    description: "Allow notifications in browser site settings to continue.",
  },
  {
    name: "unconfigured provider",
    permission: "default" as const,
    capability: unconfiguredPushCapability,
    status: "Unavailable",
    description: "This server has not configured browser reminders.",
  },
  {
    name: "disabled worker",
    permission: "default" as const,
    capability: { ...configuredPushCapability, worker: "known_disabled" as const },
    status: "Worker off",
    description: "The reminder worker is intentionally disabled.",
  },
] as const) {
  test(`Settings exposes the ${scenario.name} reminder state without requesting permission`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "One browser owns each degraded-state proof.");

    await installBrowserPushMock(page, scenario.permission);
    await mockPushCapability(page, scenario.capability);
    await signUpThroughUi(page, testInfo, { returnTo: "/settings" });

    const panel = pushSettingsPanel(page);
    await expect(pushStatus(panel, scenario.status)).toBeVisible();
    await expect(panel.getByText(scenario.description, { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Enable in this browser" })).toBeDisabled();
    if (scenario.permission !== "unsupported") {
      expect((await readBrowserPushMock(page)).permissionRequests).toBe(0);
    }
    await expectNoSeriousViolations(page);
    await expectNoHorizontalOverflow(page);
  });
}

test("task details create, validate, update, recover, and remove an absolute reminder", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !taskInteractionProjects.has(testInfo.project.name),
    "Desktop and mobile own the reminder interaction contract.",
  );
  test.setTimeout(120_000);

  await mockPushCapability(page, unconfiguredPushCapability);
  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page);
  const task = await quickAddTask(page, `P6 absolute reminder ${randomUUID()}`);
  await page.goto(`/tasks/${task.id}`);

  const reminder = reminderPanel(page, task.id);
  await expect(reminder.getByRole("heading", { name: "Reminder", exact: true })).toBeVisible();
  await expect(reminder.getByRole("button", { name: "Add reminder", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(reminder.getByText("No reminder", { exact: true })).toBeVisible();
  await expect(
    reminder.getByRole("status").filter({
      hasText: "This server cannot deliver browser reminders yet. The saved reminder remains available.",
    }),
  ).toBeVisible();
  await reminder.getByRole("button", { name: "Add reminder", exact: true }).click();

  const reminderTime = reminder.getByLabel("Reminder date and time", { exact: true });
  await reminderTime.fill("2020-01-01T00:00");
  await expect(
    reminder.getByRole("status").filter({ hasText: "Choose a reminder time after the current time." }),
  ).toBeVisible();
  await expect(reminder.getByRole("button", { name: "Save reminder", exact: true })).toBeDisabled();

  const firstFutureTime = futureLocalInput(48);
  await reminderTime.fill(firstFutureTime);
  await expect(reminder.getByRole("status").filter({ hasText: "Interpreted as:" })).toBeVisible();
  await reminder.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(reminder.getByText("Enabled", { exact: true })).toBeVisible();
  await expect(reminder.getByText(/^At /u)).toBeVisible();

  await reminder.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(reminder.getByText("Disabled", { exact: true })).toBeVisible();
  await reminder.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(reminder.getByText("Enabled", { exact: true })).toBeVisible();

  await reminder.getByRole("button", { name: "Edit reminder", exact: true }).click();
  const preservedDraft = futureLocalInput(72);
  await reminderTime.fill(preservedDraft);
  await page.route(`**/api/v1/tasks/${task.id}/reminder`, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:opentask:problem:conflict",
        title: "Conflict",
        status: 409,
        code: "CONFLICT",
        detail: "This reminder changed elsewhere.",
        correlationId: "p6-browser-conflict",
        currentVersion: 2,
      }),
    });
  });
  await reminder.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(reminder.getByRole("alert")).toContainText("This reminder changed elsewhere.");
  await expect(reminderTime).toHaveValue(preservedDraft);
  await expect(reminder.getByRole("button", { name: "Load latest reminder", exact: true })).toBeVisible();
  await expectNoSeriousViolations(page);
  await reminder.getByRole("button", { name: "Load latest reminder", exact: true }).click();
  await expect(reminder.getByText(/Latest reminder loaded\. Your draft is preserved/u)).toBeVisible();
  await expect(reminderTime).toHaveValue(preservedDraft);
  await page.unroute(`**/api/v1/tasks/${task.id}/reminder`);
  await reminder.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(reminder.getByText("Enabled", { exact: true })).toBeVisible();

  await reminder.getByRole("button", { name: "Remove…", exact: true }).click();
  const confirmation = reminder.getByRole("group", { name: "Confirm reminder removal" });
  await expect(confirmation.getByRole("button", { name: "Keep reminder", exact: true })).toBeVisible();
  await confirmation.getByRole("button", { name: "Remove reminder", exact: true }).click();
  await expect(reminder.getByText("No reminder", { exact: true })).toBeVisible();

  await reminder.getByRole("button", { name: "Add reminder", exact: true }).click();
  await reminderTime.fill(futureLocalInput(96));
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith(`/${task.id}/reminder`)) {
      writes.push(request.url());
    }
  });
  await context.setOffline(true);
  await expect(page.getByText("Task details are read-only while you’re offline.")).toBeVisible();
  await expect(reminderTime).toBeDisabled();
  await expect(reminder.getByRole("button", { name: "Save reminder", exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  await expectNoSeriousViolations(page);
  await context.setOffline(false);
  await expect(page.getByText("Task details are read-only while you’re offline.")).toBeHidden();
  await page.waitForTimeout(250);
  expect(writes).toEqual([]);
  await expect(reminderTime).toBeEnabled();
  await expect(page.getByText("Connection restored. Writes are available again.")).toBeHidden({
    timeout: 6_000,
  });
  await expectNoHorizontalOverflow(page);
  await captureP6Evidence(page, testInfo.project.name, "task-reminder-form");
});

test("reminder response-loss retries and recovery reconcile authoritative state", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One production browser owns the response-loss recovery contract.",
  );
  test.setTimeout(120_000);

  await mockPushCapability(page, unconfiguredPushCapability);
  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page);
  const task = await quickAddTask(page, `P6 response loss ${randomUUID()}`);
  await page.goto(`/tasks/${task.id}`);

  const reminder = reminderPanel(page, task.id);
  await reminder.getByRole("button", { name: "Add reminder", exact: true }).click();
  const reminderTime = reminder.getByLabel("Reminder date and time", { exact: true });
  await reminderTime.fill(futureLocalInput(48));

  const createBodies: Array<Record<string, unknown>> = [];
  await maskCommittedReminderResponse(page, task.id, "PUT", createBodies);
  await reminder.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(reminder.getByRole("alert")).toContainText("change could not be confirmed");
  await expect(reminder.getByRole("button", { name: "Check saved reminder" })).toBeVisible();
  await page.unroute(`**/api/v1/tasks/${task.id}/reminder`);

  const replayRequest = page.waitForRequest(
    (request) =>
      request.method() === "PUT" && new URL(request.url()).pathname === `/api/v1/tasks/${task.id}/reminder`,
  );
  await reminder.getByRole("button", { name: "Save reminder", exact: true }).click();
  const replayBody = (await replayRequest).postDataJSON() as Record<string, unknown>;
  expect(createBodies).toHaveLength(1);
  expect(replayBody.id).toBe(createBodies[0]?.id);
  expect(replayBody.expectedVersion).toBeNull();
  await expect(reminder.getByText("Enabled", { exact: true })).toBeVisible();

  await reminder.getByRole("button", { name: "Edit reminder", exact: true }).click();
  await reminderTime.fill(futureLocalInput(72));
  await maskCommittedReminderResponse(page, task.id, "PUT");
  await reminder.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(reminder.getByRole("alert")).toContainText("change could not be confirmed");
  await page.unroute(`**/api/v1/tasks/${task.id}/reminder`);
  await reminder.getByRole("button", { name: "Check saved reminder", exact: true }).click();
  await expect(reminder.getByText(/Latest reminder loaded\. Your draft is preserved/u)).toBeVisible();
  await reminder.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(reminder.getByText(/^At /u)).toBeVisible();

  await reminder.getByRole("button", { name: "Remove…", exact: true }).click();
  await maskCommittedReminderResponse(page, task.id, "DELETE");
  await reminder.getByRole("button", { name: "Remove reminder", exact: true }).click();
  await expect(reminder.getByRole("alert")).toContainText("change could not be confirmed");
  await page.unroute(`**/api/v1/tasks/${task.id}/reminder`);
  await reminder.getByRole("button", { name: "Check saved reminder", exact: true }).click();
  await expect(reminder.getByText("No reminder", { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("a timed task supports a relative-start reminder while preserving browser-readiness context", async ({
  page,
}, testInfo) => {
  test.skip(
    !taskInteractionProjects.has(testInfo.project.name),
    "Desktop and mobile own the relative reminder interaction contract.",
  );
  test.setTimeout(90_000);

  await installBrowserPushMock(page, "granted");
  await mockPushCapability(page);
  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page);
  const task = await quickAddTask(page, `P6 relative reminder ${randomUUID()}`);
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1_000);
  await setTaskSchedule(page, task, {
    kind: "timed",
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timezone: "Asia/Singapore",
  });
  await page.goto(`/tasks/${task.id}`);

  const reminder = reminderPanel(page, task.id);
  const addReminder = reminder.getByRole("button", { name: "Add reminder", exact: true });
  await expect(addReminder).toBeVisible({ timeout: 30_000 });
  await addReminder.click();
  await reminder.getByRole("radio", { name: "Before task start", exact: true }).check();
  await reminder.getByLabel("Minutes before start", { exact: true }).fill("30");
  await expect(
    reminder.getByRole("status").filter({ hasText: "Interpreted as: 30 minutes before the eligible start" }),
  ).toBeVisible();
  await reminder.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(reminder.getByText("Enabled", { exact: true })).toBeVisible();
  await expect(reminder.getByText("30 minutes before the eligible start", { exact: true })).toBeVisible();
  await expect(
    reminder.getByRole("status").filter({
      hasText: "local subscription, but its association with this account is not verified",
    }),
  ).toBeVisible();
  await expect(reminder.getByRole("link", { name: "Open Settings", exact: true })).toBeVisible();
  await expectNoSeriousViolations(page);
  await expectNoHorizontalOverflow(page);
});

test("recurrence explicitly converts or removes an absolute reminder and cancel changes nothing", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One production browser owns the atomic recurrence-reminder review flow.",
  );
  test.setTimeout(120_000);

  await mockPushCapability(page, unconfiguredPushCapability);
  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page);
  const startDate = addLocalDays(localDateIn("Asia/Singapore"), 3);
  const endDate = addLocalDays(startDate, 1);

  const convertTask = await quickAddTask(page, `P6 convert reminder ${randomUUID()}`);
  await setTaskSchedule(page, convertTask, { kind: "all_day", startDate, endDate });
  const convertReminder = await setAbsoluteReminder(page, convertTask.id);
  await page.goto(`/tasks/${convertTask.id}`);

  const convertRecurrence = recurrencePanel(page, convertTask.id);
  await convertRecurrence.getByRole("button", { name: "Add recurrence", exact: true }).click();
  await convertRecurrence.getByRole("spinbutton", { name: "Repeat every", exact: true }).fill("2");
  await convertRecurrence.getByRole("button", { name: "Add recurrence", exact: true }).click();

  let review = page.getByRole("dialog", { name: "Review the saved reminder", exact: true });
  await expect(review.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  await review.getByRole("radio", { name: /Convert to before task start/u }).check();
  await review.getByLabel("Minutes before start", { exact: true }).fill("30");
  await review.getByRole("button", { name: "Keep editing", exact: true }).click();

  await expect(review).toBeHidden();
  await expect(convertRecurrence.getByRole("spinbutton", { name: "Repeat every" })).toHaveValue("2");
  await expect(reminderPanel(page, convertTask.id).getByText(/^At /u)).toBeVisible();

  await convertRecurrence.getByRole("button", { name: "Add recurrence", exact: true }).click();
  review = page.getByRole("dialog", { name: "Review the saved reminder", exact: true });
  const convertRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === `/api/v1/tasks/${convertTask.id}/recurrence`,
  );
  await review.getByRole("button", { name: "Continue with recurrence", exact: true }).click();
  const convertRequest = await convertRequestPromise;
  expect(convertRequest.postDataJSON()).toMatchObject({
    reminderResolution: {
      kind: "convert_relative_start",
      expectedReminderVersion: convertReminder.version,
      offsetMinutes: 30,
    },
  });
  await expect(convertRecurrence.getByText("Recurrence added", { exact: true })).toBeVisible();
  await expect(
    reminderPanel(page, convertTask.id).getByText("30 minutes before the eligible start", { exact: true }),
  ).toBeVisible();

  await page.goto("/inbox");
  const removeTask = await quickAddTask(page, `P6 remove reminder ${randomUUID()}`);
  await setTaskSchedule(page, removeTask, { kind: "all_day", startDate, endDate });
  const removeReminder = await setAbsoluteReminder(page, removeTask.id);
  await page.goto(`/tasks/${removeTask.id}`);

  const removeRecurrence = recurrencePanel(page, removeTask.id);
  await removeRecurrence.getByRole("button", { name: "Add recurrence", exact: true }).click();
  await removeRecurrence.getByRole("button", { name: "Add recurrence", exact: true }).click();
  review = page.getByRole("dialog", { name: "Review the saved reminder", exact: true });
  await review.getByRole("radio", { name: /Remove the reminder/u }).check();
  const removeRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === `/api/v1/tasks/${removeTask.id}/recurrence`,
  );
  await review.getByRole("button", { name: "Continue with recurrence", exact: true }).click();
  const removeRequest = await removeRequestPromise;
  expect(removeRequest.postDataJSON()).toMatchObject({
    reminderResolution: { kind: "remove", expectedReminderVersion: removeReminder.version },
  });
  await expect(removeRecurrence.getByText("Recurrence added", { exact: true })).toBeVisible();
  await expect(reminderPanel(page, removeTask.id).getByText("No reminder", { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page);
  await expectNoHorizontalOverflow(page);
});

test("the installed worker accepts only G8 payloads and opens the same-origin task detail", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One real Chromium worker owns G8 routing.");
  test.setTimeout(90_000);

  await signUpThroughUi(page, testInfo);
  const task = await quickAddTask(page, `P6 push click ${randomUUID()}`);
  await waitForPwaControl(page);
  const worker = await activeOpenTaskWorker(context);
  const deliveryId = randomUUID();

  const shown = await dispatchPush(worker, { schemaVersion: 1, taskId: task.id, deliveryId });
  expect(shown).toEqual([
    {
      body: "A task is ready for your attention.",
      data: { schemaVersion: 1, taskId: task.id, deliveryId },
      tag: `opentask-${deliveryId}`,
      title: "Task reminder",
    },
  ]);
  expect(await dispatchPush(worker, { schemaVersion: 1, taskId: "not-a-task", deliveryId })).toEqual([]);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const clickResult = await dispatchNotificationClick(worker, {
    schemaVersion: 1,
    taskId: task.id,
    deliveryId,
  });
  expect(clickResult).toEqual({
    closed: true,
    focusCalls: 1,
    navigations: [`${new URL(page.url()).origin}/tasks/${task.id}`],
    openedWindows: [],
  });
  expect(
    await dispatchNotificationClick(worker, {
      schemaVersion: 1,
      taskId: "https://outside.example.test/private",
      deliveryId,
    }),
  ).toEqual({ closed: true, focusCalls: 0, navigations: [], openedWindows: [] });

  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(task.title);
});

function pushSettingsPanel(page: Page) {
  return page.locator('[aria-labelledby="push-reminders-title"]');
}

function pushStatus(panel: ReturnType<typeof pushSettingsPanel>, label: string) {
  return panel.getByRole("status").filter({ hasText: label });
}

function reminderPanel(page: Page, taskId: string) {
  return page.locator(`section[aria-labelledby="reminder-title-${taskId}"]`);
}

function recurrencePanel(page: Page, taskId: string) {
  return page.locator(`section[aria-labelledby="recurrence-title-${taskId}"]`);
}

async function setAbsoluteReminder(page: Page, taskId: string) {
  const response = await page.context().request.put(`/api/v1/tasks/${taskId}/reminder`, {
    data: {
      id: randomUUID(),
      expectedVersion: null,
      enabled: true,
      spec: {
        kind: "absolute",
        remindAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        offsetMinutes: null,
      },
    },
    headers: { origin: appOrigin },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { version: number };
}

async function maskCommittedReminderResponse(
  page: Page,
  taskId: string,
  method: "DELETE" | "PUT",
  capturedBodies: Array<Record<string, unknown>> = [],
) {
  let handled = false;
  await page.route(`**/api/v1/tasks/${taskId}/reminder`, async (route) => {
    if (handled || route.request().method() !== method) return route.fallback();
    handled = true;
    const body = route.request().postDataJSON();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      capturedBodies.push(body as Record<string, unknown>);
    }
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:opentask:problem:internal",
        title: "Server error",
        status: 503,
        code: "INTERNAL",
        detail: "The committed response was unavailable.",
        correlationId: "p6-response-loss",
      }),
    });
  });
}
