import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  addLocalDays,
  calendarDateCell,
  calendarEvent,
  configureTestTimeZone,
  localDateIn,
  planningTaskRow,
  readTaskSchedule,
  setTaskSchedule,
  type TestSchedule,
} from "./support/golden-path-planning";
import { signUpThroughUi } from "./support/wp01-auth";
import { quickAddTask, taskRow, type TaskWireRecord } from "./support/wp03-tasks";

const responsiveProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const timeZone = "Asia/Singapore";

test("G2 projects canonical scheduled tasks across Today, Upcoming, Calendar, and Matrix", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(!responsiveProjects.has(testInfo.project.name), "The G2 golden path runs at desktop and mobile.");

  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page, timeZone);
  const today = localDateIn(timeZone);
  const tomorrow = addLocalDays(today, 1);
  const dayAfterTomorrow = addLocalDays(today, 2);

  const allDayCreated = await quickAddTask(page, "G2 all-day canonical task");
  const timedCreated = await quickAddTask(page, "G2 timed canonical task");
  const capturedNow = new Date();
  const timedStart = new Date(capturedNow.getTime() - 10 * 60_000);
  const timedEnd = new Date(capturedNow.getTime() + 2 * 60 * 60_000);
  const { task: allDay } = await setTaskSchedule(page, allDayCreated, {
    kind: "all_day",
    startDate: today,
    endDate: tomorrow,
  });
  const { task: timed } = await setTaskSchedule(page, timedCreated, {
    kind: "timed",
    startAt: timedStart.toISOString(),
    endAt: timedEnd.toISOString(),
    timezone: timeZone,
  });

  await page.reload();
  await expect(taskRow(page, allDay.id)).toBeVisible();
  await expect(taskRow(page, timed.id)).toBeVisible();

  await page.goto("/today");
  await expectCanonicalProjectionRow(page, allDay);
  await expectCanonicalProjectionRow(page, timed);
  const naturalTask = await addNaturalLanguageTask(page, "G2 source tomorrow at 3pm with notes");
  const naturalSchedule = await readTaskSchedule(page, naturalTask.id);
  expect(naturalSchedule).toMatchObject({ kind: "timed", timezone: timeZone });
  expect(naturalSchedule?.kind).toBe("timed");
  if (naturalSchedule?.kind === "timed") {
    expect(new Date(naturalSchedule.endAt).getTime() - new Date(naturalSchedule.startAt).getTime()).toBe(
      30 * 60_000,
    );
  }

  await page.goto("/upcoming");
  for (const task of [allDay, timed, naturalTask]) await expectCanonicalProjectionRow(page, task);

  await page.goto("/calendar");
  for (const view of ["Month", "Week", "Day", "Agenda"] as const) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.getByRole("button", { name: view, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Today", exact: true }).click();
    if (view === "Month" && !(await calendarEvent(page, allDay.title).isVisible())) {
      const more = page
        .getByRole("button", { name: /^\+\d+ more$/u })
        .filter({ visible: true })
        .first();
      await expect(more).toBeVisible();
      await more.click();
    }
    await expect(calendarEvent(page, allDay.title)).toBeVisible();
    await expect(calendarEvent(page, timed.title)).toBeVisible();
    await expect(calendarEvent(page, allDay.title)).toHaveAttribute("href", `/tasks/${allDay.id}`);
    await expect(calendarEvent(page, timed.title)).toHaveAttribute("href", `/tasks/${timed.id}`);
  }

  await editCalendarScheduleWithKeyboard(page, allDay, {
    kind: "all_day",
    startDate: tomorrow,
    endDate: dayAfterTomorrow,
  });
  await expect
    .poll(async () => readTaskSchedule(page, allDay.id))
    .toMatchObject({
      kind: "all_day",
      startDate: tomorrow,
      endDate: dayAfterTomorrow,
    });

  await page.goto("/today");
  await expect(planningTaskRow(page, allDay.title)).toHaveCount(0);
  await expectCanonicalProjectionRow(page, timed);
  await page.goto("/upcoming");
  await expectCanonicalProjectionRow(page, allDay);

  await page.goto("/matrix");
  await expectCanonicalProjectionRow(page, allDay);
  await expectCanonicalProjectionRow(page, timed);
  await changeMatrixPriorityWithKeyboard(page, allDay, "High");
  await page.reload();
  await expect(planningTaskRow(page, allDay.title).getByRole("img", { name: "high priority" })).toBeVisible();

  await editMatrixScheduleWithKeyboard(page, allDay, {
    kind: "all_day",
    startDate: today,
    endDate: tomorrow,
  });
  await page.reload();
  const doNow = page.getByRole("region", { name: /Do now/u });
  await expect(doNow).toContainText(allDay.title);
  await expectCanonicalProjectionRow(page, allDay);

  await page.goto("/today");
  await expectCanonicalProjectionRow(page, allDay);
  await expectCanonicalProjectionRow(page, timed);
  await page.goto("/calendar");
  await page.waitForLoadState("networkidle");
  const agendaButton = page.getByRole("button", { name: "Agenda", exact: true });
  if ((await agendaButton.getAttribute("aria-pressed")) !== "true") await agendaButton.click();
  await expect(agendaButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(calendarEvent(page, allDay.title)).toBeVisible();
});

test("G2 moves an all-day calendar event with the pointer", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One reliable pointer move runs on desktop.");

  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page, timeZone);
  const today = localDateIn(timeZone);
  const tomorrow = addLocalDays(today, 1);
  const dayAfterTomorrow = addLocalDays(today, 2);
  const created = await quickAddTask(page, "G2 draggable all-day task");
  const { task } = await setTaskSchedule(page, created, {
    kind: "all_day",
    startDate: today,
    endDate: tomorrow,
  });

  await page.goto("/calendar");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const event = calendarEvent(page, task.title);
  const target = calendarDateCell(page, tomorrow);
  await expect(event).toBeVisible();
  await expect(target).toBeVisible();
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PATCH" &&
      new URL(candidate.url()).pathname === `/api/v1/tasks/${task.id}/schedule`,
  );
  await dragWithPointer(page, event, target);
  expect((await response).status()).toBe(200);
  await expect
    .poll(async () => readTaskSchedule(page, task.id))
    .toMatchObject({
      kind: "all_day",
      startDate: tomorrow,
      endDate: dayAfterTomorrow,
    });
});

test("G2 resizes an all-day calendar event with the pointer", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One reliable pointer resize runs on desktop.");

  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page, timeZone);
  const today = localDateIn(timeZone);
  const tomorrow = addLocalDays(today, 1);
  const dayAfterTomorrow = addLocalDays(today, 2);
  const created = await quickAddTask(page, "G2 resizable all-day task");
  const { task } = await setTaskSchedule(page, created, {
    kind: "all_day",
    startDate: today,
    endDate: tomorrow,
  });

  await page.goto("/calendar");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const event = calendarEvent(page, task.title);
  const resizeHandle = event.locator('[data-ui="calendar-event-resize-handle"]');
  await expect(event).toBeVisible();
  await expect(resizeHandle).toBeVisible();
  const resizeResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PATCH" &&
      new URL(candidate.url()).pathname === `/api/v1/tasks/${task.id}/schedule`,
  );
  await resizeHandle.dragTo(calendarDateCell(page, tomorrow));
  expect((await resizeResponse).status()).toBe(200);
  await expect
    .poll(async () => readTaskSchedule(page, task.id))
    .toMatchObject({
      kind: "all_day",
      startDate: today,
      endDate: dayAfterTomorrow,
    });
});

async function addNaturalLanguageTask(page: Page, title: string): Promise<TaskWireRecord> {
  const composer = page.locator("form").filter({ hasText: "Recognized dates stay visible" });
  const input = composer.getByRole("textbox", { name: "Add a task" });
  await input.fill(title);
  await expect(composer.getByRole("button", { name: /Clear recognized value/u })).toBeVisible({
    timeout: 30_000,
  });
  await expect(input).toHaveValue(title);
  await composer.getByRole("button", { name: /Edit recognized value/u }).click();
  const dialog = page.getByRole("dialog", { name: "Edit schedule" });
  const start = dialog.getByLabel("Start", { exact: true });
  await expect(start).toHaveValue(/T15:00$/u);
  const startValue = await start.inputValue();
  const localDate = startValue.slice(0, 10);
  await dialog.getByLabel("End", { exact: true }).fill(`${localDate}T15:30`);
  await dialog.getByRole("button", { name: "Save schedule" }).click();
  await expect(dialog).toBeHidden();
  await expect(input).toHaveValue(title);
  await expect(composer.getByRole("button", { name: /Edit recognized value .*3:30 PM/u })).toBeVisible();

  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/tasks",
  );
  const scheduledResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/api\/v1\/tasks\/[^/]+\/schedule$/u.test(new URL(response.url()).pathname),
  );
  await composer.getByRole("button", { name: "Add task", exact: true }).click();
  const created = (await (await createdResponse).json()) as TaskWireRecord;
  expect((await scheduledResponse).status()).toBe(200);
  await expect(input).toHaveValue("");
  return created;
}

async function expectCanonicalProjectionRow(page: Page, task: Pick<TaskWireRecord, "id" | "title">) {
  const row = planningTaskRow(page, task.title);
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("link", { name: task.title })).toHaveAttribute("href", `/tasks/${task.id}`);
}

async function editCalendarScheduleWithKeyboard(
  page: Page,
  task: Pick<TaskWireRecord, "id">,
  schedule: Extract<TestSchedule, { kind: "all_day" }>,
) {
  const selection = page.getByLabel("Task to edit");
  await selection.selectOption(task.id);
  const edit = page.getByRole("button", { name: "Edit schedule", exact: true });
  await edit.focus();
  await edit.press("Enter");
  await saveAllDaySchedule(page, task.id, schedule);
}

async function changeMatrixPriorityWithKeyboard(
  page: Page,
  task: Pick<TaskWireRecord, "id" | "title">,
  priority: "High",
) {
  const row = planningTaskRow(page, task.title);
  const menu = row.getByRole("button", { name: `More actions for ${task.title}` });
  await menu.focus();
  await menu.press("Enter");
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PATCH" &&
      new URL(candidate.url()).pathname === `/api/v1/tasks/${task.id}`,
  );
  await page.getByRole("menuitemradio", { name: priority, exact: true }).press("Enter");
  expect((await response).status()).toBe(200);
}

async function editMatrixScheduleWithKeyboard(
  page: Page,
  task: Pick<TaskWireRecord, "id" | "title">,
  schedule: Extract<TestSchedule, { kind: "all_day" }>,
) {
  const menu = planningTaskRow(page, task.title).getByRole("button", {
    name: `More actions for ${task.title}`,
  });
  await menu.focus();
  await menu.press("Enter");
  await page.getByRole("menuitem", { name: "Edit schedule" }).press("Enter");
  await saveAllDaySchedule(page, task.id, schedule);
}

async function saveAllDaySchedule(
  page: Page,
  taskId: string,
  schedule: Extract<TestSchedule, { kind: "all_day" }>,
) {
  const dialog = page.getByRole("dialog", { name: "Edit schedule" });
  await expect(dialog).toBeVisible();
  const allDay = dialog.getByRole("checkbox", { name: "All-day schedule" });
  if (!(await allDay.isChecked())) await allDay.check();
  await dialog.getByLabel("Start date", { exact: true }).fill(schedule.startDate);
  await dialog.getByLabel("End date (exclusive)", { exact: true }).fill(schedule.endDate);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "PATCH" &&
      new URL(candidate.url()).pathname === `/api/v1/tasks/${taskId}/schedule`,
  );
  const save = dialog.getByRole("button", { name: "Save schedule" });
  await save.focus();
  await save.press("Enter");
  expect((await response).status()).toBe(200);
  await expect(dialog).toBeHidden();
}

async function dragWithPointer(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!sourceBox || !targetBox) throw new Error("Calendar drag endpoints must have layout boxes.");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 - 12, sourceBox.y + sourceBox.height / 2, {
    steps: 4,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.mouse.up();
}
