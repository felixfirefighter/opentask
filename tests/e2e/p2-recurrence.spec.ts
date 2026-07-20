import { randomUUID } from "node:crypto";

import { expect, test, type APIResponse, type Locator, type Page, type TestInfo } from "@playwright/test";

const APP_ORIGIN = "http://127.0.0.1:3107";
const goldenPathProjects = new Set(["desktop-chromium", "mobile-chromium"]);

const demo = {
  recurringTaskId: "50000000-0000-4000-8000-000000000011",
  recurringTaskTitle: "Review workshop progress",
  scheduledTaskId: "50000000-0000-4000-8000-000000000001",
  scheduledTaskTitle: "Outline the workshop agenda",
} as const;

test("a scheduled task can become, restart, reschedule, and end a series before completion", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    !goldenPathProjects.has(testInfo.project.name),
    "The P2 task-detail lifecycle runs at desktop and mobile widths.",
  );

  await enterIsolatedDemo(page, testInfo);
  await openTaskDetails(page, demo.scheduledTaskId, demo.scheduledTaskTitle);

  const details = taskDetails(page);
  const recurrence = recurrenceSection(page);
  await expect(recurrence.getByText("Does not repeat", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(page.getByText("Task details are read-only while you’re offline.")).toBeVisible();
  await expect(recurrence.getByRole("button", { name: "Add recurrence" })).toBeDisabled();
  await expect(details.getByRole("button", { name: "Edit schedule", exact: true })).toBeDisabled();
  await expect(details.getByRole("button", { name: "Open", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText("Task details are read-only while you’re offline.")).toBeHidden();

  await recurrence.getByRole("button", { name: "Add recurrence" }).click();
  const createForm = recurrence.locator("form");
  await createForm.getByRole("combobox", { name: "Ends", exact: true }).selectOption("count");
  await createForm.getByRole("spinbutton", { name: "Occurrences", exact: true }).fill("20");
  const createResponse = waitForMutation(page, `/tasks/${demo.scheduledTaskId}/recurrence`, "PATCH");
  await recurrence.getByRole("button", { name: "Add recurrence" }).click();
  expect((await createResponse).status()).toBe(200);
  await expect(recurrence.getByRole("button", { name: "Edit recurrence" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(recurrence.getByText("Recurrence added", { exact: true })).toBeVisible();
  await expect(recurrence.getByText("Active", { exact: true })).toBeVisible();
  await expect(recurrence).toContainText("20 occurrences, including the anchor");

  const ownerStatus = details.getByRole("button", { name: "Open", exact: true });
  await expect(ownerStatus).toBeDisabled();
  await expect(ownerStatus).toHaveAttribute("title", "End recurrence before completing this task");
  await openTaskActions(details, demo.scheduledTaskTitle);
  await expect(page.getByRole("menuitem", { name: "Complete task" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.keyboard.press("Escape");

  await recurrence.getByRole("button", { name: "Edit recurrence" }).click();
  const editForm = recurrence.locator("form");
  await editForm.getByRole("spinbutton", { name: "Repeat every", exact: true }).fill("2");
  await editForm.getByRole("spinbutton", { name: "Occurrences", exact: true }).fill("24");
  await editForm.getByRole("button", { name: "Save and restart" }).click();
  const restartDialog = page.getByRole("alertdialog", { name: "Restart future recurrence?" });
  await expect(restartDialog.getByRole("button", { name: "Keep current series" })).toBeFocused();
  const restartResponse = waitForMutation(page, `/tasks/${demo.scheduledTaskId}/recurrence`, "PATCH");
  await restartDialog.getByRole("button", { name: "Restart future recurrence" }).click();
  expect((await restartResponse).status()).toBe(200);
  await expect(recurrence.getByRole("button", { name: "Edit recurrence" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(recurrence.getByText("Future recurrence restarted", { exact: true })).toBeVisible();
  await expect(recurrence).toContainText("Every 2 days");
  await expect(recurrence).toContainText("24 occurrences, including the anchor");

  const editRecurringSchedule = details.getByRole("button", {
    name: "Edit recurring schedule",
    exact: true,
  });
  await editRecurringSchedule.focus();
  await editRecurringSchedule.press("Enter");
  const start = details.getByLabel("Start", { exact: true });
  const end = details.getByLabel("End", { exact: true });
  await expect(start).toBeFocused({ timeout: 10_000 });
  await tabTo(page, end, 10);
  const originalEnd = await end.inputValue();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => end.inputValue()).not.toBe(originalEnd);
  expect(Date.parse(await end.inputValue())).toBeGreaterThan(Date.parse(originalEnd));
  const saveSchedule = details.getByRole("button", { name: "Save schedule", exact: true });
  await tabTo(page, saveSchedule);
  const scheduleResponse = waitForMutation(
    page,
    `/tasks/${demo.scheduledTaskId}/recurrence/schedule`,
    "PATCH",
  );
  await saveSchedule.press("Enter");
  expect((await scheduleResponse).status()).toBe(200);
  await expect(details.getByRole("button", { name: "Edit recurring schedule" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(details.getByText("Schedule saved", { exact: true })).toBeVisible();

  await endSeriesThroughKeyboard(page, recurrence, demo.scheduledTaskId);
  await expect(recurrence.getByRole("button", { name: "Restart recurrence" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(recurrence.getByText("Recurrence ended", { exact: true })).toBeVisible();
  await expect(recurrence.getByText("Ended", { exact: true })).toBeVisible();
  await expect(ownerStatus).toBeEnabled();

  const restartEnded = recurrence.getByRole("button", { name: "Restart recurrence" });
  await restartEnded.focus();
  await restartEnded.press("Enter");
  const restartEndedForm = recurrence.locator("form");
  await restartEndedForm.getByRole("spinbutton", { name: "Repeat every" }).fill("3");
  await restartEndedForm.getByRole("button", { name: "Save and restart" }).click();
  const restartEndedDialog = page.getByRole("alertdialog", { name: "Restart future recurrence?" });
  await expect(restartEndedDialog.getByRole("button", { name: "Keep current series" })).toBeFocused();
  const restartEndedResponse = waitForMutation(page, `/tasks/${demo.scheduledTaskId}/recurrence`, "PATCH");
  await restartEndedDialog.getByRole("button", { name: "Restart future recurrence" }).click();
  expect((await restartEndedResponse).status()).toBe(200);
  await expect(recurrence.getByText("Active", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(recurrence).toContainText("Every 3 days");
  await expect(ownerStatus).toBeDisabled();

  await endSeriesThroughKeyboard(page, recurrence, demo.scheduledTaskId);
  await expect(recurrence.getByText("Ended", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(ownerStatus).toBeEnabled();

  const completeResponse = waitForMutation(page, `/tasks/${demo.scheduledTaskId}/status`, "POST");
  await ownerStatus.focus();
  await ownerStatus.press("Enter");
  expect((await completeResponse).status()).toBe(200);
  await expect(details.getByRole("button", { name: "Completed", exact: true })).toBeVisible();
});

test("a stale recurrence draft stays intact and retries against the authoritative version", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop fault-injection path is sufficient.");

  await enterIsolatedDemo(page, testInfo);
  await openTaskDetails(page, demo.recurringTaskId, demo.recurringTaskTitle);
  const recurrence = recurrenceSection(page);
  await expect(recurrence.getByRole("button", { name: "Edit recurrence" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(recurrence.getByText("Active", { exact: true })).toBeVisible();

  await recurrence.getByRole("button", { name: "Edit recurrence" }).click();
  const form = recurrence.locator("form");
  await form.getByRole("combobox", { name: "Ends", exact: true }).selectOption("count");
  await form.getByRole("spinbutton", { name: "Occurrences", exact: true }).fill("30");

  const currentTask = await getJson<TaskWireRecord>(page, `/api/v1/tasks/${demo.recurringTaskId}`);
  const concurrentResponse = await page.context().request.patch(`/api/v1/tasks/${demo.recurringTaskId}`, {
    data: { expectedVersion: currentTask.version, patch: { priority: "high" } },
    headers: mutationHeaders(),
  });
  expect(concurrentResponse.status()).toBe(200);

  await recurrence.getByRole("button", { name: "Save and restart" }).click();
  const restartDialog = page.getByRole("alertdialog", { name: "Restart future recurrence?" });
  const conflictResponse = waitForMutation(page, `/tasks/${demo.recurringTaskId}/recurrence`, "PATCH");
  await restartDialog.getByRole("button", { name: "Restart future recurrence" }).click();
  expect((await conflictResponse).status()).toBe(409);

  const alert = recurrence.getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("This recurrence changed elsewhere.");
  await expect(form.getByRole("spinbutton", { name: "Occurrences", exact: true })).toHaveValue("30");
  const retry = alert.getByRole("button", { name: "Try again" });
  await expect(retry).toBeEnabled();
  const retryResponse = waitForMutation(page, `/tasks/${demo.recurringTaskId}/recurrence`, "PATCH");
  await retry.click();
  expect((await retryResponse).status()).toBe(200);
  await expect(recurrence.getByText("Future recurrence restarted", { exact: true })).toBeVisible();
  await expect(recurrence).toContainText("30 occurrences, including the anchor");
});

test("one occurrence supports UI transitions and exact API retry without completing its series", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One deterministic occurrence retry path is sufficient.",
  );

  await enterIsolatedDemo(page, testInfo);
  const projection = await getJson<TodayProjectionWire>(page, "/api/v1/planning/today");
  const occurrence = [...projection.overdue, ...projection.timed, ...projection.anytime].find(
    (row) => row.id === demo.recurringTaskId && row.projectionLifecycle === "recurring_occurrence",
  );
  expect(occurrence).toMatchObject({ occurrenceState: "open", status: "open" });
  if (!occurrence?.occurrenceKey) throw new Error("The deterministic demo recurrence is missing today.");

  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  const row = planningRow(page, occurrence.projectionId);
  await expect(row).toHaveAttribute("data-occurrence-state", "open");
  const completeRequest = page.waitForRequest((request) =>
    request.url().endsWith(`/api/v1/tasks/${demo.recurringTaskId}/occurrences/transition`),
  );
  const completeResponse = waitForMutation(
    page,
    `/tasks/${demo.recurringTaskId}/occurrences/transition`,
    "POST",
  );
  const complete = row.getByRole("button", { name: `Complete occurrence of ${demo.recurringTaskTitle}` });
  await complete.focus();
  await complete.press("Enter");
  const exactRequest = (await completeRequest).postDataJSON() as OccurrenceCommand;
  const completed = await readJson<OccurrenceResult>(await completeResponse);
  expect(completed).toMatchObject({ outcome: "applied", occurrenceState: "completed" });
  await expect(row).toBeHidden();

  const exactRetry = await postOccurrence(page, exactRequest);
  expect(exactRetry).toMatchObject({
    outcome: "idempotent_retry",
    occurrenceState: "completed",
    task: { version: completed.task.version },
  });
  const reopened = await postOccurrence(page, {
    action: "undo",
    occurrenceKey: occurrence.occurrenceKey,
    expectedVersion: completed.task.version,
  });
  expect(reopened).toMatchObject({ outcome: "applied", occurrenceState: "open" });

  const owner = await getJson<TaskWireRecord>(page, `/api/v1/tasks/${demo.recurringTaskId}`);
  expect(owner).toMatchObject({ status: "open", version: reopened.task.version });
  const recurrence = await getJson<RecurrenceWire>(page, `/api/v1/tasks/${demo.recurringTaskId}/recurrence`);
  expect(recurrence).toMatchObject({ lifecycle: "active", taskVersion: reopened.task.version });
});

type TaskWireRecord = Readonly<{ id: string; priority: string; status: string; version: number }>;
type RecurrenceWire = Readonly<{ lifecycle: string; taskVersion: number }>;
type OccurrenceCommand = Readonly<{
  action: "complete" | "skip" | "undo";
  occurrenceKey: string;
  expectedVersion: number;
}>;
type OccurrenceResult = Readonly<{
  outcome: "applied" | "idempotent_retry" | "no_op";
  occurrenceState: "open" | "completed" | "skipped";
  task: { id: string; version: number };
}>;
type TodayProjectionWire = Readonly<{
  overdue: readonly OccurrenceRow[];
  timed: readonly OccurrenceRow[];
  anytime: readonly OccurrenceRow[];
}>;
type OccurrenceRow = Readonly<{
  id: string;
  occurrenceKey: string | null;
  occurrenceState: "open" | "completed" | "skipped" | null;
  projectionId: string;
  projectionLifecycle: "one_off" | "recurring_occurrence" | "recurrence_summary";
  status: "open";
}>;

async function enterIsolatedDemo(page: Page, testInfo: TestInfo) {
  const seed = randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto("/");
  const responsePromise = waitForMutation(page, "/demo", "POST");
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await responsePromise).status(), `${testInfo.project.name} demo entry`).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
}

async function openTaskDetails(page: Page, taskId: string, title: string) {
  await page.goto(`/tasks/${taskId}?returnTo=%2Finbox`);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(title, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Recurrence", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

function taskDetails(page: Page) {
  return page.locator('article[aria-labelledby^="task-title-"]');
}

function recurrenceSection(page: Page) {
  return page.locator('section[aria-labelledby^="recurrence-title-"]');
}

function planningRow(page: Page, projectionId: string) {
  return page.locator(`[data-planning-projection-id="${projectionId}"]`);
}

async function openTaskActions(details: ReturnType<typeof taskDetails>, title: string) {
  await details.getByRole("button", { name: `More actions for ${title}` }).click();
  await expect(details.page().getByRole("menu")).toBeVisible();
}

function waitForMutation(page: Page, pathSuffix: string, method: "PATCH" | "POST") {
  return page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname.endsWith(`/api/v1${pathSuffix}`) && request.method() === method;
  });
}

async function getJson<T>(page: Page, path: string): Promise<T> {
  const response = await page.context().request.get(path);
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
}

async function postOccurrence(page: Page, command: OccurrenceCommand): Promise<OccurrenceResult> {
  const response = await page
    .context()
    .request.post(`/api/v1/tasks/${demo.recurringTaskId}/occurrences/transition`, {
      data: command,
      headers: mutationHeaders(),
    });
  return readJson<OccurrenceResult>(response);
}

async function readJson<T>(response: Pick<APIResponse, "json" | "status">): Promise<T> {
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
}

function mutationHeaders() {
  return { origin: APP_ORIGIN };
}

async function tabTo(page: Page, target: Locator, maximumSteps = 60) {
  for (let step = 0; step <= maximumSteps; step += 1) {
    if (await target.evaluate((element) => document.activeElement === element)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function endSeriesThroughKeyboard(page: Page, recurrence: Locator, taskId: string) {
  const endRecurrence = recurrence.getByRole("button", { name: "End recurrence…" });
  await endRecurrence.focus();
  await endRecurrence.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "End future recurrence?" });
  await expect(dialog.getByRole("button", { name: "Keep current series" })).toBeFocused();
  const response = waitForMutation(page, `/tasks/${taskId}/recurrence/end`, "POST");
  const confirm = dialog.getByRole("button", { name: "End future recurrence" });
  await confirm.focus();
  await confirm.press("Enter");
  expect((await response).status()).toBe(200);
}
