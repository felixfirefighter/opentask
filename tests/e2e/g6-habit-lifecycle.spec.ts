import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  createHabitViaApi,
  createHabitThroughUi,
  demoHabits,
  enterHabitDemo,
  expectNoHorizontalOverflow,
  mutationHeaders,
  readHabitLocalDate,
  recordHabitViaApi,
  type HabitDetailWire,
  type HabitLogWire,
  waitForHabitResponse,
} from "./support/p3-habits";
import { openVisibleAccountMenu, signUpThroughUi } from "./support/wp01-auth";

const goldenPathProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const allWeekdays = [1, 2, 3, 4, 5, 6, 7] as const;

test("a deterministic demo supports the complete habit lifecycle at desktop and mobile widths", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  test.skip(!goldenPathProjects.has(testInfo.project.name), "G6 runs at desktop and mobile widths.");

  await enterHabitDemo(page, testInfo);
  const localDate = await readHabitLocalDate(page, "Asia/Singapore");
  const projectLabel = testInfo.project.name === "mobile-chromium" ? "mobile" : "desktop";
  const createdTitle = `Release reflection ${projectLabel}`;
  const editedTitle = `Release reflection ${projectLabel} edited`;

  await page.goto("/habits");
  await expect(page.getByRole("heading", { name: "Habits", level: 1 })).toBeVisible();
  const activeList = page.getByRole("region", { name: "Active habits" });
  for (const title of [
    demoHabits.activeBooleanTitle,
    demoHabits.activeNumericTitle,
    demoHabits.activeWeeklyTitle,
  ]) {
    await expect(activeList).toContainText(title);
  }
  await expectNoHorizontalOverflow(page, "active Habits");

  const view = page.getByRole("navigation", { name: "Habit view" });
  await view.getByRole("link", { name: "Archived", exact: true }).click();
  await expect(page).toHaveURL(/\/habits\?view=archived$/u);
  await expect(page.getByRole("region", { name: "Archived habits" })).toContainText(demoHabits.archivedTitle);
  await expectNoHorizontalOverflow(page, "archived Habits");
  await page.goto("/habits?view=active");
  await expect(page).toHaveURL(/\/habits\?view=active$/u);
  await expect(page.getByRole("region", { name: "Active habits" })).toContainText(
    demoHabits.activeBooleanTitle,
  );

  await page.getByRole("button", { name: "Create habit", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Create habit" });
  await createDialog.getByLabel("Title", { exact: true }).fill(createdTitle);
  await createDialog.getByLabel("Icon or emoji", { exact: true }).fill("🧭");
  await createDialog.getByRole("combobox", { name: "Category", exact: true }).selectOption("violet");
  await createDialog.getByRole("radio", { name: "Check in once" }).check();
  await createDialog.getByRole("combobox", { name: "Schedule", exact: true }).selectOption("daily");
  await createDialog.getByLabel("Start date", { exact: true }).fill(localDate);
  await createDialog.getByLabel("Timezone", { exact: true }).fill("Asia/Singapore");
  await expect(createDialog.getByText(/Daily · from/u)).toBeVisible();
  const createResponsePromise = waitForHabitResponse(page, "/api/v1/habits", "POST");
  await createDialog.getByRole("button", { name: "Create habit", exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as HabitDetailWire;
  expect(created).toMatchObject({
    habit: {
      title: createdTitle,
      icon: "🧭",
      colorToken: "violet",
      goal: { goalKind: "boolean", targetValue: null, unit: null },
      version: 1,
      archivedAt: null,
    },
    schedule: {
      schedule: { kind: "daily", timezone: "Asia/Singapore", startDate: localDate },
    },
  });
  const habitId = created.habit.id;
  expect(createResponse.headers().location).toBe(`/api/v1/habits/${habitId}`);
  await expect(page.getByRole("link", { name: `Open ${createdTitle}`, exact: true })).toBeVisible();

  const numeric = await createHabitThroughUi(page, {
    title: `Practice minutes ${projectLabel}`,
    icon: "🎹",
    colorToken: "sky",
    goal: { goalKind: "quantity", targetValue: 20, unit: "minutes" },
    schedule: {
      kind: "weekdays",
      weekdays: allWeekdays,
      targetPerWeek: null,
      timezone: "Asia/Singapore",
      startDate: localDate,
      endDate: null,
    },
  });
  await expect(page.getByRole("link", { name: `Open ${numeric.habit.title}`, exact: true })).toBeVisible();
  const weekly = await createHabitThroughUi(page, {
    title: `Movement target ${projectLabel}`,
    icon: "🌿",
    colorToken: "mint",
    goal: { goalKind: "boolean", targetValue: null, unit: null },
    schedule: {
      kind: "weekly_target",
      weekdays: null,
      targetPerWeek: 3,
      timezone: "Asia/Singapore",
      startDate: localDate,
      endDate: null,
    },
  });
  expect(numeric.schedule.schedule.kind).toBe("weekdays");
  expect(weekly.schedule.schedule.kind).toBe("weekly_target");
  await expect(page.getByRole("link", { name: `Open ${weekly.habit.title}`, exact: true })).toBeVisible();
  const remainingCombinations = await createRemainingHabitCombinations(page, localDate, projectLabel);
  expect(
    [created, numeric, weekly, ...remainingCombinations]
      .map(({ habit, schedule }) => `${habit.goal.goalKind}:${schedule.schedule.kind}`)
      .sort(),
  ).toEqual([
    "boolean:daily",
    "boolean:weekdays",
    "boolean:weekly_target",
    "quantity:daily",
    "quantity:weekdays",
    "quantity:weekly_target",
  ]);

  await page.reload();
  await page.getByRole("link", { name: `Open ${createdTitle}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: createdTitle, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Edit habit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit habit" });
  await editDialog.getByLabel("Title", { exact: true }).fill(editedTitle);
  await editDialog.getByRole("combobox", { name: "Schedule", exact: true }).selectOption("weekdays");
  for (const weekday of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
    await editDialog.getByRole("checkbox", { name: weekday, exact: true }).check();
  }
  await expect(editDialog.getByText(/Monday, Tuesday, Wednesday/u)).toBeVisible();
  const updateResponsePromise = waitForHabitResponse(page, `/api/v1/habits/${habitId}`, "PATCH");
  const scheduleResponsePromise = waitForHabitResponse(page, `/api/v1/habits/${habitId}/schedule`, "PATCH");
  await editDialog.getByRole("button", { name: "Save habit" }).click();
  const updateResponse = await updateResponsePromise;
  const scheduleResponse = await scheduleResponsePromise;
  expect(updateResponse.status()).toBe(200);
  await expect(updateResponse.json()).resolves.toMatchObject({
    habit: { id: habitId, title: editedTitle, version: 2 },
  });
  expect(scheduleResponse.status()).toBe(200);
  await expect(scheduleResponse.json()).resolves.toMatchObject({
    habit: { id: habitId, version: 3 },
    schedule: { schedule: { kind: "weekdays", weekdays: allWeekdays } },
  });
  await expect(page.getByRole("heading", { name: editedTitle, level: 1 })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Current practice" })).toBeVisible();
  await expect(page.getByText(/Current \d+ days? · Best \d+ days?/u)).toBeVisible();
  await expect(page.getByRole("list", { name: `Seven-day history for ${editedTitle}` })).toBeVisible();
  await expect(page.locator('[aria-label$="heat map"]')).toBeVisible();
  await expect(
    page.getByRole("table", { name: new RegExp(`history for ${escapeRegExp(editedTitle)}$`, "u") }),
  ).toBeVisible();
  await expect(page.getByText("No check-ins yet", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, "habit detail");

  await page.goto("/today");
  const row = habitArticle(page, editedTitle);
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Check in", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, "Today habits");

  const checkInResponsePromise = waitForHabitResponse(
    page,
    new RegExp(`/api/v1/habits/${habitId}/logs$`, "u"),
    "POST",
  );
  await row.getByRole("button", { name: "Check in", exact: true }).click();
  const checkInResponse = await checkInResponsePromise;
  const checkedIn = await expectLogResponse(checkInResponse, 201, {
    habitId,
    localDate,
    state: "completed",
    quantity: null,
    note: null,
    successful: true,
    version: 1,
  });
  await expect(row.getByText("Habit day saved.", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Undo", exact: true })).toBeVisible();

  await openCheckInMenu(row, editedTitle);
  await page.getByRole("menuitem", { name: "Edit check-in…" }).click();
  const dayDialog = page.getByRole("dialog", { name: `Edit ${editedTitle}` });
  await dayDialog.getByLabel(/Note/u).fill("Primary UI edit");
  const editLogResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${habitId}/logs/${localDate}`,
    "PATCH",
  );
  await dayDialog.getByRole("button", { name: "Save check-in" }).click();
  const editedLog = await expectLogResponse(await editLogResponsePromise, 200, {
    id: checkedIn.id,
    habitId,
    localDate,
    state: "completed",
    quantity: null,
    note: "Primary UI edit",
    successful: true,
    version: 2,
  });
  expect(editedLog.version).toBe(2);

  await openCheckInMenu(row, editedTitle);
  const skipResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${habitId}/logs/${localDate}`,
    "PATCH",
  );
  await page.getByRole("menuitem", { name: "Skip this day" }).click();
  await expectLogResponse(await skipResponsePromise, 200, {
    id: checkedIn.id,
    habitId,
    localDate,
    state: "skipped",
    quantity: null,
    note: "Primary UI edit",
    successful: false,
    version: 3,
  });

  await openCheckInMenu(row, editedTitle);
  const unachievedResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${habitId}/logs/${localDate}`,
    "PATCH",
  );
  await page.getByRole("menuitem", { name: "Mark unachieved" }).click();
  await expectLogResponse(await unachievedResponsePromise, 200, {
    id: checkedIn.id,
    habitId,
    localDate,
    state: "unachieved",
    quantity: null,
    note: "Primary UI edit",
    successful: false,
    version: 4,
  });

  await openCheckInMenu(row, editedTitle);
  const undoResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${habitId}/logs/${localDate}/undo`,
    "POST",
  );
  await page.getByRole("menuitem", { name: "Undo check-in" }).click();
  await expectLogResponse(await undoResponsePromise, 200, {
    id: checkedIn.id,
    habitId,
    localDate,
    state: "unachieved",
    quantity: null,
    note: "Primary UI edit",
    successful: false,
    version: 4,
  });
  await expect(row.getByRole("button", { name: "Check in", exact: true })).toBeVisible();

  const finalCheckInResponsePromise = waitForHabitResponse(
    page,
    new RegExp(`/api/v1/habits/${habitId}/logs$`, "u"),
    "POST",
  );
  await row.getByRole("button", { name: "Check in", exact: true }).click();
  await expectLogResponse(await finalCheckInResponsePromise, 201, {
    habitId,
    localDate,
    state: "completed",
    quantity: null,
    note: null,
    successful: true,
    version: 1,
  });

  await exerciseNumericHabitLifecycle(page, numeric, localDate);

  await page.goto(`/habits/${habitId}`);
  const habitDetail = page.getByRole("main");
  const fullDate = fullLocalDate(localDate);
  await expect(habitDetail.getByRole("list", { name: `Seven-day history for ${editedTitle}` })).toContainText(
    localDate.slice(-2).replace(/^0/u, ""),
  );
  await expect(habitDetail.getByText(`${fullDate}: Completed`, { exact: true })).toBeAttached();
  const archiveTrigger = habitDetail.getByRole("button", { name: "Archive", exact: true });
  await archiveTrigger.click();
  let archiveDialog = page.getByRole("alertdialog", {
    name: `Archive “${editedTitle}”?`,
    exact: true,
  });
  await expect(archiveDialog).toBeVisible();
  await expect(archiveDialog).toContainText(
    "History will be preserved. This habit will leave Today and your active habits until you restore it.",
  );
  const keepHabit = archiveDialog.getByRole("button", { name: "Keep habit", exact: true });
  await expect(keepHabit).toBeFocused();
  await keepHabit.click();
  await expect(archiveDialog).toBeHidden();
  await expect(archiveTrigger).toBeFocused();
  await expect(habitDetail.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);

  await archiveTrigger.click();
  archiveDialog = page.getByRole("alertdialog", {
    name: `Archive “${editedTitle}”?`,
    exact: true,
  });
  await expect(archiveDialog).toBeVisible();
  const archiveResponsePromise = waitForHabitResponse(page, `/api/v1/habits/${habitId}/archive`, "POST");
  await archiveDialog.getByRole("button", { name: "Archive habit", exact: true }).click();
  const archiveResponse = await archiveResponsePromise;
  expect(archiveResponse.status()).toBe(200);
  await expect(archiveResponse.json()).resolves.toMatchObject({
    habit: { id: habitId, title: editedTitle, version: 4, archivedAt: expect.any(String) },
  });
  await expect(habitDetail.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await expect(habitDetail.getByText(`${fullDate}: Completed`, { exact: true })).toBeAttached();

  await habitDetail.getByRole("link", { name: "Back to habits", exact: true }).click();
  await expect(page).toHaveURL(/\/habits\?view=archived$/u);
  await expect(page.getByRole("region", { name: "Archived habits" })).toContainText(editedTitle);
  await page
    .getByRole("main")
    .getByRole("link", { name: `Open ${editedTitle}`, exact: true })
    .click();
  const restoreResponsePromise = waitForHabitResponse(page, `/api/v1/habits/${habitId}/restore`, "POST");
  await page.getByRole("main").getByRole("button", { name: "Restore", exact: true }).click();
  const restoreResponse = await restoreResponsePromise;
  expect(restoreResponse.status()).toBe(200);
  await expect(restoreResponse.json()).resolves.toMatchObject({
    habit: { id: habitId, title: editedTitle, version: 5, archivedAt: null },
  });
  await expect(page.getByRole("main").getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await page.goto("/habits");
  const restoredList = page.getByRole("region", { name: "Active habits" });
  for (const title of [
    editedTitle,
    numeric.habit.title,
    weekly.habit.title,
    ...remainingCombinations.map(({ habit }) => habit.title),
  ]) {
    await expect(restoredList).toContainText(title);
  }
  await expectNoHorizontalOverflow(page, "restored active Habits");
});

test("habit conflict recovery preserves the draft and offline mode denies writes", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop recovery path is sufficient.");

  await enterHabitDemo(page, testInfo);
  const localDate = await readHabitLocalDate(page, "Asia/Singapore");
  const habit = await createHabitViaApi(page, {
    title: "Conflict-safe habit",
    icon: "🧩",
    colorToken: "amber",
    goal: { goalKind: "boolean", targetValue: null, unit: null },
    schedule: {
      kind: "daily",
      weekdays: null,
      targetPerWeek: null,
      timezone: "Asia/Singapore",
      startDate: localDate,
      endDate: null,
    },
  });
  const baseLog = await recordHabitViaApi(page, habit.habit.id, localDate, {
    state: "completed",
    quantity: null,
    note: "Original check-in note",
  });
  await page.goto(`/habits/${habit.habit.id}`);
  await page.getByRole("button", { name: "Edit habit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit habit" });
  const title = dialog.getByLabel("Title", { exact: true });
  await title.fill("Preserved conflict draft");

  const concurrent = await page.context().request.patch(`/api/v1/habits/${habit.habit.id}`, {
    data: { expectedVersion: 1, patch: { icon: "🔥" } },
    headers: mutationHeaders(),
  });
  expect(concurrent.status()).toBe(200);
  await expect(concurrent.json()).resolves.toMatchObject({
    habit: { id: habit.habit.id, icon: "🔥", version: 2 },
  });

  const conflictResponsePromise = waitForHabitResponse(page, `/api/v1/habits/${habit.habit.id}`, "PATCH");
  await dialog.getByRole("button", { name: "Save habit" }).click();
  const conflictResponse = await conflictResponsePromise;
  expect(conflictResponse.status()).toBe(409);
  const conflictProblem = (await conflictResponse.json()) as Record<string, unknown>;
  expect(conflictProblem).toMatchObject({
    status: 409,
    code: "CONFLICT",
    currentVersion: 2,
  });
  expect(JSON.stringify(conflictProblem)).not.toContain("Conflict-safe habit");
  await expect(title).toHaveValue("Preserved conflict draft");
  await expect(dialog.getByRole("alert")).toContainText("Changes were not saved");
  await dialog.getByRole("button", { name: "Review latest in this form" }).click();
  await expect(title).toHaveValue("Preserved conflict draft");
  await expect(dialog.getByLabel("Icon or emoji", { exact: true })).toHaveValue("🔥");
  const mergedSavePromise = waitForHabitResponse(page, `/api/v1/habits/${habit.habit.id}`, "PATCH");
  await dialog.getByRole("button", { name: "Save habit" }).click();
  expect((await mergedSavePromise).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Preserved conflict draft", level: 1 })).toBeVisible();

  const habitDetail = page.getByRole("main");
  await openCheckInMenu(habitDetail, "Preserved conflict draft");
  await page.getByRole("menuitem", { name: "Edit check-in…" }).click();
  const checkInDialog = page.getByRole("dialog", { name: "Edit Preserved conflict draft" });
  const note = checkInDialog.getByLabel("Note (optional)");
  await note.fill("Preserved check-in draft");
  const concurrentLog = await page
    .context()
    .request.patch(`/api/v1/habits/${habit.habit.id}/logs/${localDate}`, {
      data: {
        expectedVersion: baseLog.version,
        value: { state: "completed", quantity: null, note: "Concurrent check-in note" },
      },
      headers: mutationHeaders(),
    });
  expect(concurrentLog.status()).toBe(200);
  const logConflictPromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${habit.habit.id}/logs/${localDate}`,
    "PATCH",
  );
  await checkInDialog.getByRole("button", { name: "Save check-in" }).click();
  expect((await logConflictPromise).status()).toBe(409);
  await expect(note).toHaveValue("Preserved check-in draft");
  await expect(checkInDialog.getByRole("alert")).toContainText("changed elsewhere");
  await checkInDialog.getByRole("button", { name: "Review latest in this form" }).click();
  await expect(note).toHaveValue("Preserved check-in draft");
  const mergedLogPromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${habit.habit.id}/logs/${localDate}`,
    "PATCH",
  );
  await checkInDialog.getByRole("button", { name: "Save check-in" }).click();
  expect((await mergedLogPromise).status()).toBe(200);
  await expect(checkInDialog).toBeHidden();

  await page.getByRole("button", { name: "Edit habit", exact: true }).click();
  const offlineDialog = page.getByRole("dialog", { name: "Edit habit" });
  await offlineDialog.getByLabel("Title", { exact: true }).fill("Draft kept while offline");
  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(offlineDialog.getByText("Reconnect before saving.")).toBeVisible();
  await expect(offlineDialog.getByRole("button", { name: "Save habit" })).toBeDisabled();
  await expect(offlineDialog.getByLabel("Title", { exact: true })).toHaveValue("Draft kept while offline");
  await offlineDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Habits are read-only", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit habit", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(page.getByText("Reconnect to change this habit.", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, "offline habit detail");
  await context.setOffline(false);
});

test("a second user receives only generic habit denial and no private content", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop two-user denial is sufficient.");

  await signUpThroughUi(page, testInfo);
  const localDate = await readHabitLocalDate(page, "Asia/Singapore");
  const privateTitle = `Private habit ${randomUUID()}`;
  const privateNote = `Private note ${randomUUID()}`;
  const habit = await createHabitViaApi(page, {
    title: privateTitle,
    icon: "🔒",
    colorToken: "slate",
    goal: { goalKind: "quantity", targetValue: 5, unit: "pages" },
    schedule: {
      kind: "daily",
      weekdays: null,
      targetPerWeek: null,
      timezone: "Asia/Singapore",
      startDate: localDate,
      endDate: null,
    },
  });
  await recordHabitViaApi(page, habit.habit.id, localDate, {
    state: "completed",
    quantity: 5,
    note: privateNote,
  });
  await page.goto(`/habits/${habit.habit.id}`);
  await expect(page.getByRole("heading", { name: privateTitle })).toBeVisible();

  const { menu } = await openVisibleAccountMenu(page);
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await signUpThroughUi(page, testInfo);

  const denied = await page.context().request.get(`/api/v1/habits/${habit.habit.id}`);
  expect(denied.status()).toBe(404);
  const denialBody = await denied.text();
  expect(JSON.parse(denialBody)).toMatchObject({ status: 404, code: "NOT_FOUND" });
  expect(denialBody).not.toContain(privateTitle);
  expect(denialBody).not.toContain(privateNote);

  const secondUserHabits = await page.context().request.get("/api/v1/habits/overviews?lifecycle=active");
  expect(secondUserHabits.status()).toBe(200);
  const secondUserBody = await secondUserHabits.text();
  expect(secondUserBody).not.toContain(habit.habit.id);
  expect(secondUserBody).not.toContain(privateTitle);
  expect(secondUserBody).not.toContain(privateNote);

  await page.goto(`/habits/${habit.habit.id}`);
  await expect(page.getByRole("heading", { name: "Habit unavailable" })).toBeVisible();
  await expect(
    page.getByRole("main").getByText("This habit could not be found or you may not have access."),
  ).toBeVisible();
  await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByText(privateNote, { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "permission-safe habit detail");
});

async function createRemainingHabitCombinations(
  page: Page,
  localDate: string,
  projectLabel: string,
): Promise<readonly HabitDetailWire[]> {
  return Promise.all([
    createHabitViaApi(page, {
      title: `Weekday reset ${projectLabel}`,
      icon: "🌤️",
      colorToken: "coral",
      goal: { goalKind: "boolean", targetValue: null, unit: null },
      schedule: {
        kind: "weekdays",
        weekdays: allWeekdays,
        targetPerWeek: null,
        timezone: "Asia/Singapore",
        startDate: localDate,
        endDate: null,
      },
    }),
    createHabitViaApi(page, {
      title: `Daily pages ${projectLabel}`,
      icon: "📚",
      colorToken: "violet",
      goal: { goalKind: "quantity", targetValue: 10, unit: "pages" },
      schedule: {
        kind: "daily",
        weekdays: null,
        targetPerWeek: null,
        timezone: "Asia/Singapore",
        startDate: localDate,
        endDate: null,
      },
    }),
    createHabitViaApi(page, {
      title: `Weekly minutes ${projectLabel}`,
      icon: "🎨",
      colorToken: "slate",
      goal: { goalKind: "quantity", targetValue: 30, unit: "minutes" },
      schedule: {
        kind: "weekly_target",
        weekdays: null,
        targetPerWeek: 2,
        timezone: "Asia/Singapore",
        startDate: localDate,
        endDate: null,
      },
    }),
  ]);
}

async function exerciseNumericHabitLifecycle(
  page: Page,
  numeric: HabitDetailWire,
  localDate: string,
): Promise<void> {
  await page.goto("/today");
  const todayRow = habitArticle(page, numeric.habit.title);
  await expect(todayRow).toBeVisible();
  const createResponsePromise = waitForHabitResponse(
    page,
    new RegExp(`/api/v1/habits/${numeric.habit.id}/logs$`, "u"),
    "POST",
  );
  await todayRow.getByRole("button", { name: "Enter quantity", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: `Record ${numeric.habit.title}` });
  await createDialog.getByRole("spinbutton", { name: "Quantity (minutes)" }).fill("12.5");
  await createDialog.getByRole("textbox", { name: "Note (optional)" }).fill("Warm-up through the UI");
  await createDialog.getByRole("button", { name: "Save check-in", exact: true }).click();
  const created = await expectLogResponse(await createResponsePromise, 201, {
    habitId: numeric.habit.id,
    localDate,
    state: "completed",
    quantity: 12.5,
    note: "Warm-up through the UI",
    successful: false,
    version: 1,
  });

  await page.goto(`/habits/${numeric.habit.id}`);
  const detail = page.getByRole("main");
  await expect(detail.getByRole("heading", { name: numeric.habit.title, level: 1 })).toBeVisible();
  await expect(
    detail.getByText(`${fullLocalDate(localDate)}: Recorded, 12.5 minutes, below target`, {
      exact: true,
    }),
  ).toBeAttached();

  await detail.getByRole("button", { name: "Edit check-in", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: `Edit ${numeric.habit.title}` });
  await editDialog.getByRole("spinbutton", { name: "Quantity (minutes)" }).fill("25");
  await editDialog.getByRole("textbox", { name: "Note (optional)" }).fill("Reached the target in detail");
  const editResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${numeric.habit.id}/logs/${localDate}`,
    "PATCH",
  );
  await editDialog.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expectLogResponse(await editResponsePromise, 200, {
    id: created.id,
    habitId: numeric.habit.id,
    localDate,
    state: "completed",
    quantity: 25,
    note: "Reached the target in detail",
    successful: true,
    version: 2,
  });
  await expect(
    detail.getByText(`${fullLocalDate(localDate)}: Completed, 25 minutes`, { exact: true }),
  ).toBeAttached();

  await openCheckInMenu(detail, numeric.habit.title);
  const skipResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${numeric.habit.id}/logs/${localDate}`,
    "PATCH",
  );
  await page.getByRole("menuitem", { name: "Skip this day" }).click();
  await expectLogResponse(await skipResponsePromise, 200, {
    id: created.id,
    state: "skipped",
    quantity: null,
    note: "Reached the target in detail",
    successful: false,
    version: 3,
  });
  await expect(detail.getByText(`${fullLocalDate(localDate)}: Skipped`, { exact: true })).toBeAttached();

  await openCheckInMenu(detail, numeric.habit.title);
  const unachievedResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${numeric.habit.id}/logs/${localDate}`,
    "PATCH",
  );
  await page.getByRole("menuitem", { name: "Mark unachieved" }).click();
  await expectLogResponse(await unachievedResponsePromise, 200, {
    id: created.id,
    state: "unachieved",
    quantity: null,
    note: "Reached the target in detail",
    successful: false,
    version: 4,
  });
  await expect(
    detail.getByText(`${fullLocalDate(localDate)}: Marked unachieved`, { exact: true }),
  ).toBeAttached();

  await openCheckInMenu(detail, numeric.habit.title);
  const undoResponsePromise = waitForHabitResponse(
    page,
    `/api/v1/habits/${numeric.habit.id}/logs/${localDate}/undo`,
    "POST",
  );
  await page.getByRole("menuitem", { name: "Undo check-in" }).click();
  await expectLogResponse(await undoResponsePromise, 200, {
    id: created.id,
    state: "unachieved",
    version: 4,
  });
  await expect(detail.getByRole("button", { name: "Enter quantity", exact: true })).toBeVisible();
}

function habitArticle(page: Page, title: string): Locator {
  return page.getByRole("main").getByRole("article").filter({ hasText: title });
}

async function openCheckInMenu(row: Locator, title: string) {
  await row.getByRole("button", { name: `More check-in actions for ${title}`, exact: true }).click();
  await expect(row.page().getByRole("menu")).toBeVisible();
}

async function expectLogResponse(
  response: Readonly<{ status(): number; json(): Promise<unknown> }>,
  status: 200 | 201,
  expected: Partial<HabitLogWire>,
): Promise<HabitLogWire> {
  expect(response.status()).toBe(status);
  const body = (await response.json()) as HabitLogWire | { outcome: string; log: HabitLogWire };
  const log = "log" in body ? body.log : body;
  if (status === 201) expect(body).toMatchObject({ outcome: "created" });
  expect(log).toMatchObject(expected);
  return log;
}

function fullLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00.000Z`),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
