import { randomUUID } from "node:crypto";

import { expect, test, type APIResponse, type Locator, type Page, type TestInfo } from "@playwright/test";

import { taskRow, waitForTaskSearch } from "./support/wp03-tasks";

const APP_ORIGIN = "http://127.0.0.1:3107";
const goldenPathProjects = new Set(["desktop-chromium", "mobile-chromium"]);

const demo = {
  allDayTaskId: "50000000-0000-4000-8000-000000000003",
  allDayTaskTitle: "Prepare attendee notes",
  regularListId: "20000000-0000-4000-8000-000000000001",
  regularListName: "Community workshop",
  recurringTaskId: "50000000-0000-4000-8000-000000000011",
  recurringTaskTitle: "Review workshop progress",
  scheduledTaskId: "50000000-0000-4000-8000-000000000001",
  scheduledTaskTitle: "Outline the workshop agenda",
} as const;

test("a timed task can become, restart, reschedule, and end a series before completion", async ({
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
  await recurrence.getByRole("button", { name: "Add recurrence" }).click();
  const reminderReview = page.getByRole("dialog", { name: "Review the saved reminder", exact: true });
  await expect(reminderReview.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  await reminderReview.getByRole("radio", { name: /Convert to before task start/u }).check();
  await reminderReview.getByLabel("Minutes before start", { exact: true }).fill("30");
  const createResponse = waitForMutation(page, `/tasks/${demo.scheduledTaskId}/recurrence`, "PATCH");
  await reminderReview.getByRole("button", { name: "Continue with recurrence", exact: true }).click();
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

  await page.goto("/completed");
  await page.waitForLoadState("networkidle");
  const terminalRow = taskRow(page, demo.scheduledTaskId);
  await expect(terminalRow).toHaveAttribute("data-status", "completed");
  await expect(terminalRow.getByText("Repeat ended", { exact: true })).toBeVisible();
});

test("an all-day task creates an approved preset with an inclusive end date", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    !goldenPathProjects.has(testInfo.project.name),
    "The all-day recurrence path runs at desktop and mobile widths.",
  );

  await enterIsolatedDemo(page, testInfo);
  const localDate = (await getJson<TodayProjectionWire>(page, "/api/v1/planning/today")).localDate;
  await openTaskDetails(page, demo.allDayTaskId, demo.allDayTaskTitle);
  const recurrence = recurrenceSection(page);
  await recurrence.getByRole("button", { name: "Add recurrence" }).click();
  const form = recurrence.locator("form");
  await form.getByRole("combobox", { name: "Cadence", exact: true }).selectOption("daily");
  await form.getByRole("combobox", { name: "Ends", exact: true }).selectOption("until");
  const inclusiveEnd = addLocalDays(localDate, 8);
  await form.getByLabel("Inclusive end date", { exact: true }).fill(inclusiveEnd);

  const response = waitForMutation(page, `/tasks/${demo.allDayTaskId}/recurrence`, "PATCH");
  await form.getByRole("button", { name: "Add recurrence" }).click();
  expect((await response).status()).toBe(200);
  await expect(recurrence.getByText("Recurrence added", { exact: true })).toBeVisible();
  await expect(recurrence.getByText("Active", { exact: true })).toBeVisible();
  await expect(recurrence).toContainText("Every day");
  await expect(recurrence).toContainText("All day");
  await expect(recurrence).toContainText("inclusive");
});

test("a stale recurrence draft stays intact and retries against the authoritative version", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    !goldenPathProjects.has(testInfo.project.name),
    "The recurrence conflict and history path runs at desktop and mobile widths.",
  );

  await enterIsolatedDemo(page, testInfo);
  const localDate = (await getJson<TodayProjectionWire>(page, "/api/v1/planning/today")).localDate;
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

  await expectHistoricalOccurrenceStates(page, localDate);
  await openTaskDetails(page, demo.recurringTaskId, demo.recurringTaskTitle);
  await endSeriesThroughKeyboard(page, recurrenceSection(page), demo.recurringTaskId);
  await expect(recurrenceSection(page).getByText("Ended", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expectHistoricalOccurrenceStates(page, localDate);
});

test("one occurrence supports UI transitions and exact API retry without completing its series", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    !goldenPathProjects.has(testInfo.project.name),
    "The recurring projection and occurrence-action path runs at desktop and mobile widths.",
  );

  await enterIsolatedDemo(page, testInfo);
  await page.goto(`/lists/${demo.regularListId}`);
  await page.waitForLoadState("networkidle");
  const canonicalRow = taskRow(page, demo.recurringTaskId);
  await expect(canonicalRow).toBeVisible();
  await expect(canonicalRow.getByText("Repeat", { exact: true })).toBeVisible();
  await expect(
    canonicalRow.getByRole("link", {
      name: `Open recurring task ${demo.recurringTaskTitle}`,
      exact: true,
    }),
  ).toBeVisible();

  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Search tasks and commands" });
  await expect(palette).toBeVisible();
  const paletteInput = palette.getByRole("combobox", { name: "Search tasks and commands" });
  const searchResponse = waitForTaskSearch(page, demo.recurringTaskTitle);
  await paletteInput.fill(demo.recurringTaskTitle);
  expect((await searchResponse).status()).toBe(200);
  await expect(
    palette.getByRole("option", {
      name: `${demo.recurringTaskTitle}. Task · Repeat · ${demo.regularListName} · Matched title`,
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  const projection = await getJson<TodayProjectionWire>(page, "/api/v1/planning/today");
  const occurrence = [...projection.overdue, ...projection.timed, ...projection.anytime].find(
    (row) => row.id === demo.recurringTaskId && row.projectionLifecycle === "recurring_occurrence",
  );
  expect(occurrence).toMatchObject({ occurrenceState: "open", status: "open" });
  if (!occurrence?.occurrenceKey) throw new Error("The deterministic demo recurrence is missing today.");

  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  const todayRow = planningRow(page, occurrence.projectionId);
  await expect(todayRow).toBeVisible();
  await todayRow.getByRole("link", { name: demo.recurringTaskTitle }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/tasks/${demo.recurringTaskId}`);
  const occurrenceDetailsUrl = new URL(page.url());
  expect(occurrenceDetailsUrl.pathname).toBe(`/tasks/${demo.recurringTaskId}`);
  expect(occurrenceDetailsUrl.searchParams.get("returnTo")).toBe("/today");
  expect(occurrenceDetailsUrl.searchParams.get("occurrence")).toBe(occurrence.occurrenceKey);
  await expect(page.getByRole("heading", { name: "Selected occurrence" })).toBeVisible();
  await expect(page.getByText("These actions change only this occurrence, not the series.")).toBeVisible();
  const completeRequest = page.waitForRequest((request) =>
    request.url().endsWith(`/api/v1/tasks/${demo.recurringTaskId}/occurrences/transition`),
  );
  const completeResponse = waitForMutation(
    page,
    `/tasks/${demo.recurringTaskId}/occurrences/transition`,
    "POST",
  );
  await page.getByRole("button", { name: "Complete occurrence", exact: true }).click();
  const exactRequest = (await completeRequest).postDataJSON() as OccurrenceCommand;
  const completed = await readJson<OccurrenceResult>(await completeResponse);
  expect(completed).toMatchObject({ outcome: "applied", occurrenceState: "completed" });
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo occurrence", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to task list" }).click();
  await expect(page).toHaveURL("/today");
  await expect(planningRow(page, occurrence.projectionId)).toBeHidden();

  const exactRetry = await postOccurrence(page, exactRequest);
  expect(exactRetry).toMatchObject({
    outcome: "idempotent_retry",
    occurrenceState: "completed",
    task: { version: completed.task.version },
  });

  await page.goto("/upcoming");
  await page.waitForLoadState("networkidle");
  const upcomingOccurrence = planningRowsForTask(page, demo.recurringTaskId).first();
  await expect(upcomingOccurrence).toBeVisible();
  await expect(upcomingOccurrence).toHaveAttribute("data-projection-lifecycle", "recurring_occurrence");
  const today = projection.localDate;
  await page.goto(`/calendar?view=month&date=${today}`);
  await page.waitForLoadState("networkidle");
  await revealRecurringCalendarEvent(page);
  await expect(
    page.getByLabel("Task to edit", { exact: true }).locator(`option[value="${occurrence.projectionId}"]`),
  ).toHaveCount(1);
  await page.getByLabel("Task to edit", { exact: true }).selectOption(occurrence.projectionId);
  const editSeries = page.getByRole("button", { name: "Edit future series schedule", exact: true });
  await editSeries.focus();
  await editSeries.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === `/tasks/${demo.recurringTaskId}`);
  const seriesDetailsUrl = new URL(page.url());
  expect(seriesDetailsUrl.pathname).toBe(`/tasks/${demo.recurringTaskId}`);
  expect(seriesDetailsUrl.searchParams.get("edit")).toBe("series-schedule");
  expect(seriesDetailsUrl.searchParams.get("occurrence")).toBe(occurrence.occurrenceKey);
  await expect(page.getByRole("button", { name: "Save schedule", exact: true })).toBeVisible();
  await expect(page.getByLabel("Start", { exact: true })).toBeFocused();
  await page.getByRole("link", { name: "Back to task list" }).click();
  await expect(page).toHaveURL(/\/calendar/u);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByRole("button", { name: "Agenda", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(recurringCalendarEvents(page).first()).toBeVisible();
  await expect(
    page.getByLabel("Task to edit", { exact: true }).locator(`option[value="${occurrence.projectionId}"]`),
  ).toHaveCount(1);
  await page.goto("/matrix");
  await page.waitForLoadState("networkidle");
  await expect(planningRow(page, occurrence.projectionId)).toBeHidden();
  const matrixOccurrence = planningRowsForTask(page, demo.recurringTaskId).first();
  await expect(matrixOccurrence).toBeVisible();
  await expect(matrixOccurrence).toHaveAttribute("data-projection-lifecycle", "recurring_occurrence");
  await expect(matrixOccurrence).not.toHaveAttribute("data-planning-projection-id", occurrence.projectionId);

  const rangeEnd = addLocalDays(today, 3);
  const calendarProjection = await getJson<CalendarProjectionWire>(
    page,
    `/api/v1/planning/calendar?rangeStartDate=${today}&rangeEndDate=${rangeEnd}&limit=250`,
  );
  const completedEvent = calendarProjection.events.find(
    (event) => event.taskId === demo.recurringTaskId && event.occurrenceKey === occurrence.occurrenceKey,
  );
  const nextOpenEvent = calendarProjection.events.find(
    (event) =>
      event.taskId === demo.recurringTaskId &&
      event.occurrenceKey !== occurrence.occurrenceKey &&
      event.occurrenceState === "open",
  );
  expect(completedEvent).toMatchObject({ occurrenceState: "completed" });
  expect(nextOpenEvent).toMatchObject({ occurrenceState: "open" });
  if (!completedEvent || !nextOpenEvent) throw new Error("The recurrence action range is incomplete.");

  await page.goto(`/calendar?view=agenda&date=${today}&rangeStartDate=${today}&rangeEndDate=${rangeEnd}`);
  await page.waitForLoadState("networkidle");
  const selection = page.getByLabel("Task to edit", { exact: true });
  await selection.selectOption(completedEvent.projectionId);
  const undoCompletedResponse = waitForMutation(
    page,
    `/tasks/${demo.recurringTaskId}/occurrences/transition`,
    "POST",
  );
  await page.getByRole("button", { name: "Undo occurrence", exact: true }).click();
  expect((await undoCompletedResponse).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Complete occurrence", exact: true })).toBeEnabled({
    timeout: 30_000,
  });

  await selection.selectOption(nextOpenEvent.projectionId);
  await expect(page.getByRole("button", { name: "Skip occurrence", exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  const skipResponse = waitForMutation(page, `/tasks/${demo.recurringTaskId}/occurrences/transition`, "POST");
  await page.getByRole("button", { name: "Skip occurrence", exact: true }).click();
  expect((await skipResponse).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Undo occurrence", exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  const undoSkippedResponse = waitForMutation(
    page,
    `/tasks/${demo.recurringTaskId}/occurrences/transition`,
    "POST",
  );
  await page.getByRole("button", { name: "Undo occurrence", exact: true }).click();
  expect((await undoSkippedResponse).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Skip occurrence", exact: true })).toBeEnabled({
    timeout: 30_000,
  });

  const owner = await getJson<TaskWireRecord>(page, `/api/v1/tasks/${demo.recurringTaskId}`);
  expect(owner.status).toBe("open");
  const recurrence = await getJson<RecurrenceWire>(page, `/api/v1/tasks/${demo.recurringTaskId}/recurrence`);
  expect(recurrence).toMatchObject({ lifecycle: "active", taskVersion: owner.version });
});

test("task-detail permission recovery keeps a validated origin without leaking resource data", async ({
  page,
}, testInfo) => {
  test.skip(!goldenPathProjects.has(testInfo.project.name), "Task detail runs at desktop and mobile gates.");
  await enterIsolatedDemo(page, testInfo);
  const missingTaskId = randomUUID();

  await page.goto(`/tasks/${missingTaskId}?returnTo=${encodeURIComponent("/calendar?view=week")}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Task unavailable", exact: true })).toBeVisible();
  await expect(main.getByText("This task could not be found or you may not have access.")).toBeVisible();
  await expect(main.getByRole("link", { name: "Back to tasks", exact: true })).toHaveAttribute(
    "href",
    "/calendar?view=week",
  );
  await expect(main).not.toContainText(missingTaskId);

  await page.goto(`/tasks/${missingTaskId}?returnTo=${encodeURIComponent("//attacker.example/steal")}`);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Back to tasks", exact: true }),
  ).toHaveAttribute("href", "/inbox");
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
  localDate: string;
  overdue: readonly OccurrenceRow[];
  timed: readonly OccurrenceRow[];
  anytime: readonly OccurrenceRow[];
}>;
type CalendarProjectionWire = Readonly<{
  events: readonly (OccurrenceRow & Readonly<{ taskId: string }>)[];
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

function planningRowsForTask(page: Page, taskId: string) {
  return page.locator(`[data-planning-task-id="${taskId}"]`);
}

function recurringCalendarEvents(page: Page) {
  return page
    .locator(`[aria-label^="${demo.recurringTaskTitle},"][aria-label*="recurring"]`)
    .filter({ visible: true });
}

async function revealRecurringCalendarEvent(page: Page) {
  const event = recurringCalendarEvents(page).first();
  if (!(await event.isVisible())) {
    const overflow = page
      .getByRole("button", { name: /^\+\d+ more$/u })
      .filter({ visible: true })
      .first();
    await expect(overflow).toBeVisible();
    await overflow.click();
  }
  await expect(event).toBeVisible();
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

async function expectHistoricalOccurrenceStates(page: Page, localDate: string) {
  await expectHistoricalOccurrenceState(page, addLocalDays(localDate, -2), "Completed");
  await expectHistoricalOccurrenceState(page, addLocalDays(localDate, -1), "Skipped");
}

async function expectHistoricalOccurrenceState(
  page: Page,
  localDate: string,
  state: "Completed" | "Skipped",
) {
  await page.goto(`/calendar?view=agenda&date=${localDate}`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.locator(`[aria-label^="${demo.recurringTaskTitle},"][aria-label*="${state} occurrence"]`),
  ).toBeVisible();
}

async function readJson<T>(response: Pick<APIResponse, "json" | "status">): Promise<T> {
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
}

function mutationHeaders() {
  return { origin: APP_ORIGIN };
}

function addLocalDays(localDate: string, days: number) {
  const value = new Date(`${localDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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
