import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { signUpThroughUi } from "./support/wp01-auth";
import { assertPriorityMarkers, readBaseTaskRowContract } from "./support/task-row-contract";
import { addTagToTask, quickAddTask, taskRow, updateTask } from "./support/wp03-tasks";
import {
  applyOccurrenceWithoutDeliveringResponse,
  occurrenceDetailPath,
  P2_OCCURRENCE_DEMO,
  readOpenDemoOccurrenceKey,
  unavailableDemoOccurrenceKey,
} from "./support/p2-occurrence-evidence";
import {
  acquireTaskReadBarrier,
  deleteIsolatedDemoUser,
  readAuthenticatedUserId,
  readTaskForConflict,
  seedOccurrenceAheadOfTask,
} from "./support/p2-task-route-state-fixture";
import {
  createHabitViaApi,
  demoHabits,
  installHabitApiFailure,
  readHabitLocalDate,
  triggerStaleHabitRefresh,
  type HabitDetailWire,
  updateHabitViaApi,
  waitForHabitResponse,
} from "./support/p3-habits";
import { acquireHabitReadBarrier } from "./support/p3-habit-read-barrier";

const calendarCreateProjects = new Set([
  "desktop-chromium",
  "tablet-chromium",
  "mobile-chromium",
  "boundary-768-chromium",
  "boundary-320-chromium",
]);

const habitVisualProjects = new Set([
  "desktop-chromium",
  "tablet-chromium",
  "touch-tablet-chromium",
  "mobile-chromium",
  "boundary-768-chromium",
  "boundary-320-chromium",
]);

test("production TaskRow preserves the approved density, typography, and action targets", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await signUpThroughUi(page, testInfo);
  await page.evaluate(() => document.fonts.ready);
  const created = await quickAddTask(page, "Review production task row");
  const prioritized = await updateTask(page, created, { priority: "high" });
  await addTagToTask(page, prioritized, "Launch");
  await page.reload();
  await page.evaluate(() => document.fonts.ready);

  const row = taskRow(page, created.id);
  const status = row.getByRole("button", { name: `Complete ${created.title}` });
  const more = row.getByRole("button", { name: `More actions for ${created.title}` });
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: "high priority" })).toBeVisible();
  await expect(row).toContainText("Launch");
  await status.focus();
  await expect(status).toBeFocused();
  await more.focus();
  await expect(more).toBeFocused();
  await assertPriorityMarkers(page);

  const contract = await readBaseTaskRowContract(row);
  expect(contract.tokens).toEqual({
    fontDisplay: expect.stringContaining("editorialFont"),
    fontSans: expect.stringContaining("interfaceFont"),
    rowSize: "15px",
    rowLine: "22px",
    rowWeight: "500",
    compactSize: "13px",
    compactLine: "18px",
    compactWeight: "400",
    labelSize: "12px",
    labelLine: "16px",
    labelWeight: "600",
    contentGap: "4px",
    columnGap: "8px",
    desktopTarget: "36px",
    touchTarget: "44px",
    statusIndicator: "20px",
    standardHeight: "64px",
    touchHeight: "68px",
  });
  const fontState = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    const interfaceFamily = style.getPropertyValue("--font-interface").trim();
    const editorialFamily = style.getPropertyValue("--font-editorial").trim();
    const relevantFaces = Array.from(document.fonts)
      .filter((face) => /interfaceFont|editorialFont/i.test(face.family))
      .map((face) => ({ family: face.family, status: face.status }));
    return {
      status: document.fonts.status,
      interfaceFamily,
      editorialFamily,
      relevantFaces,
    };
  });
  expect(fontState.status).toBe("loaded");
  expect(fontState.interfaceFamily).toContain("interfaceFont");
  expect(fontState.editorialFamily).toContain("editorialFont");
  expect(fontState.relevantFaces).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ family: expect.stringMatching(/interfaceFont/i), status: "loaded" }),
      expect.objectContaining({
        family: expect.stringMatching(/editorialFont/i),
        status: expect.stringMatching(/^(?:loaded|unloaded)$/),
      }),
    ]),
  );
  expect(contract.bodyFontFamily).toBe(contract.tokenFontFamily);
  expect(contract.title).toMatchObject({
    color: contract.semanticColors.text,
    fontFamily: contract.tokenFontFamily,
    fontSize: contract.tokens.rowSize,
    fontWeight: contract.tokens.rowWeight,
    lineHeight: contract.tokens.rowLine,
  });
  expect(contract.metadata).toMatchObject({
    color: contract.semanticColors.muted,
    fontFamily: contract.tokenFontFamily,
    fontSize: contract.tokens.compactSize,
    fontWeight: contract.tokens.compactWeight,
    lineHeight: contract.tokens.compactLine,
  });
  expect(contract.tag).toMatchObject({
    fontFamily: contract.tokenFontFamily,
    fontSize: contract.tokens.labelSize,
    fontWeight: contract.tokens.labelWeight,
    lineHeight: contract.tokens.labelLine,
  });
  expect(contract.contentGap).toBe(contract.tokens.contentGap);
  expect(contract.row.columnGap).toBe(contract.tokens.columnGap);
  expect(contract.metadata.box.top - contract.title.box.bottom).toBeCloseTo(
    pixels(contract.tokens.contentGap),
    1,
  );

  const expectedHeight = contract.coarsePointerAvailable
    ? contract.tokens.touchHeight
    : contract.tokens.standardHeight;
  const expectedTarget = pixels(
    contract.coarsePointerAvailable ? contract.tokens.touchTarget : contract.tokens.desktopTarget,
  );
  expect(contract.row.minHeight).toBe(expectedHeight);
  expect(contract.row.box.height).toBeGreaterThanOrEqual(pixels(expectedHeight));
  expect(contract.status.box.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.status.box.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.more.box.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.more.box.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.statusIndicatorBox.width).toBe(pixels(contract.tokens.statusIndicator));
  expect(contract.statusIndicatorBox.height).toBe(pixels(contract.tokens.statusIndicator));
  expect(contract.contentBox.right).toBeLessThanOrEqual(contract.trailingBox.left);
  if (contract.viewportWidth >= 390) expect(contract.title.textFits).toBe(true);
  expect(contract.metadata.textFits).toBe(true);

  if (contract.viewportWidth < 768) expect(contract.tag.display).toBe("none");
  else expect(contract.tag.display).not.toBe("none");

  const evidenceDirectory = path.resolve("artifacts/visual-proof/wp03");
  await mkdir(evidenceDirectory, { recursive: true });
  await more.evaluate((element) => (element as HTMLElement).blur());
  await row.screenshot({
    path: path.join(evidenceDirectory, `production-task-row-${testInfo.project.name}.png`),
    animations: "disabled",
  });
});

test("the public landing keeps labeled entry actions inside every boundary viewport", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const heroHeading = page.getByRole("heading", { name: "Make room for what matters." });
  await expect(heroHeading).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Try demo" })).toBeVisible();

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.clientWidth).toBe(page.viewportSize()?.width);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

  const ctaLayout = await page.evaluate(() => {
    const main = document.querySelector("main");
    const createAccount = main?.querySelector('a[href="/sign-up"]');
    const tryDemo = Array.from(main?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("Try demo"),
    );
    if (!(createAccount instanceof HTMLElement) || !(tryDemo instanceof HTMLElement)) {
      throw new Error("Landing hero actions are missing");
    }
    const createAccountRect = createAccount.getBoundingClientRect();
    const tryDemoRect = tryDemo.getBoundingClientRect();
    const targetSize = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--control-target-touch"),
    );
    return {
      createAccountHeight: createAccountRect.height,
      targetSize,
      tryDemoHeight: tryDemoRect.height,
    };
  });
  expect(ctaLayout.createAccountHeight).toBe(ctaLayout.targetSize);
  expect(ctaLayout.tryDemoHeight).toBe(ctaLayout.targetSize);

  const typography = await heroHeading.evaluate((heading) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const headingStyle = getComputedStyle(heading);
    const sectionHeading = document.querySelector("h2");
    if (!(sectionHeading instanceof HTMLElement)) throw new Error("Landing section heading is missing");
    const sectionHeadingStyle = getComputedStyle(sectionHeading);
    const token = (name: string) => rootStyle.getPropertyValue(name).trim();
    const normalizeFontFamily = (value: string) =>
      value.split(",").map((family) => family.trim().replace(/^['"]|['"]$/g, ""));
    return {
      displayFamilies: normalizeFontFamily(rootStyle.getPropertyValue("--font-display")),
      headingFamilies: normalizeFontFamily(headingStyle.fontFamily),
      heading: {
        fontSize: headingStyle.fontSize,
        fontWeight: headingStyle.fontWeight,
        letterSpacing: headingStyle.letterSpacing,
        lineHeight: headingStyle.lineHeight,
        textWrap: headingStyle.textWrap,
      },
      scales: {
        mega: {
          size: token("--type-display-mega-size"),
          weight: token("--type-display-mega-weight"),
          tracking: token("--type-display-mega-tracking"),
          line: token("--type-display-mega-line"),
        },
        xl: {
          size: token("--type-display-xl-size"),
          weight: token("--type-display-xl-weight"),
          tracking: token("--type-display-xl-tracking"),
          line: token("--type-display-xl-line"),
        },
        lg: {
          size: token("--type-display-lg-size"),
          weight: token("--type-display-lg-weight"),
          tracking: token("--type-display-lg-tracking"),
          line: token("--type-display-lg-line"),
        },
        sm: {
          size: token("--type-display-sm-size"),
          weight: token("--type-display-sm-weight"),
          tracking: token("--type-display-sm-tracking"),
          line: token("--type-display-sm-line"),
        },
      },
      sectionHeading: {
        families: normalizeFontFamily(sectionHeadingStyle.fontFamily),
        fontSize: sectionHeadingStyle.fontSize,
        fontWeight: sectionHeadingStyle.fontWeight,
        letterSpacing: sectionHeadingStyle.letterSpacing,
        lineHeight: sectionHeadingStyle.lineHeight,
        textWrap: sectionHeadingStyle.textWrap,
      },
      editorialFaces: Array.from(document.fonts)
        .filter((face) => /editorialFont/i.test(face.family))
        .map((face) => ({ family: face.family, status: face.status })),
    };
  });
  expect(typography.headingFamilies).toEqual(typography.displayFamilies);
  const viewportWidth = page.viewportSize()!.width;
  const expectedScale =
    viewportWidth >= 1280
      ? typography.scales.mega
      : viewportWidth >= 768
        ? typography.scales.xl
        : typography.scales.lg;
  expect(typography.heading).toMatchObject({
    fontSize: expectedScale.size,
    fontWeight: expectedScale.weight,
    textWrap: "balance",
  });
  expect(Number.parseFloat(typography.heading.letterSpacing)).toBeCloseTo(
    Number.parseFloat(expectedScale.tracking),
    2,
  );
  expect(Number.parseFloat(typography.heading.lineHeight)).toBeCloseTo(
    Number.parseFloat(expectedScale.size) * Number.parseFloat(expectedScale.line),
    1,
  );
  expect(typography.sectionHeading).toMatchObject({
    families: typography.displayFamilies,
    fontSize: typography.scales.sm.size,
    fontWeight: typography.scales.sm.weight,
    letterSpacing: "normal",
    textWrap: "balance",
  });
  expect(Number.parseFloat(typography.sectionHeading.lineHeight)).toBeCloseTo(
    Number.parseFloat(typography.scales.sm.size) * Number.parseFloat(typography.scales.sm.line),
    1,
  );
  expect(typography.editorialFaces).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ family: expect.stringMatching(/editorialFont/i), status: "loaded" }),
    ]),
  );

  const evidenceDirectory = path.resolve("artifacts/visual-proof/boundaries");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDirectory, `landing-${testInfo.project.name}.png`),
    animations: "disabled",
    fullPage: true,
  });
  await page.evaluate(() => {
    localStorage.setItem("opentask-theme-preference", "dark");
    document.documentElement.dataset.themePreference = "dark";
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({
    path: path.join(evidenceDirectory, `landing-dark-${testInfo.project.name}.png`),
    animations: "disabled",
    fullPage: true,
  });
});

test("mobile authenticated surfaces preserve the touch and readable-range contract", async ({
  page,
}, testInfo) => {
  test.skip(
    !["mobile-chromium", "boundary-320-chromium"].includes(testInfo.project.name),
    "The two mobile boundary projects own this contract.",
  );
  test.setTimeout(90_000);
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });
  await page.goto("/");
  const demoResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await demoResponse).status()).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });

  await assertMobileTouchContracts(page, "50000000-0000-4000-8000-000000000001");
});

test("the Calendar create form fits every required responsive viewport", async ({ page }, testInfo) => {
  test.skip(
    !calendarCreateProjects.has(testInfo.project.name),
    "One project per required width owns the Calendar create-form contract.",
  );
  test.setTimeout(90_000);
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });
  await page.goto("/");
  const demoResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await demoResponse).status()).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar", exact: true }).first()).toBeVisible();
  const addTask = page.getByRole("main").getByRole("button", { name: "Add task", exact: true });
  await addTask.click();
  const dialog = page.getByRole("dialog", { name: "Create scheduled task" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Task title", { exact: true })).toBeFocused();
  await expect(dialog.getByLabel("Notes (Markdown)", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "List", exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Priority", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Schedule timezone", { exact: true })).toBeDisabled();
  await page.evaluate(() => document.fonts.ready);
  await expectUsesSans(
    dialog.getByRole("heading", { name: "Create scheduled task" }),
    "Calendar create title",
  );

  const layout = await dialog.evaluate((element) => {
    const dialogRect = element.getBoundingClientRect();
    const root = document.documentElement;
    const fields = Array.from(element.querySelectorAll("input, select, textarea, button"));
    return {
      activeName: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent,
      dialogClientWidth: element.clientWidth,
      dialogLeft: dialogRect.left,
      dialogRight: dialogRect.right,
      dialogScrollWidth: element.scrollWidth,
      fieldsInsideDialog: fields.every((field) => {
        const rect = field.getBoundingClientRect();
        return rect.left >= dialogRect.left - 1 && rect.right <= dialogRect.right + 1;
      }),
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      dialogTop: dialogRect.top,
      dialogBottom: dialogRect.bottom,
    };
  });
  expect(layout.rootScrollWidth, "Calendar create page horizontal overflow").toBeLessThanOrEqual(
    layout.rootClientWidth + 1,
  );
  expect(layout.dialogScrollWidth, "Calendar create dialog horizontal overflow").toBeLessThanOrEqual(
    layout.dialogClientWidth + 1,
  );
  expect(layout.dialogLeft).toBeGreaterThanOrEqual(-1);
  expect(layout.dialogRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.dialogTop).toBeGreaterThanOrEqual(-1);
  expect(layout.dialogBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.fieldsInsideDialog).toBe(true);

  await expectResponsiveTarget(
    page,
    dialog.getByRole("button", { name: "Close task form" }),
    "Calendar create close",
  );
  await expectResponsiveTarget(
    page,
    dialog.getByRole("button", { name: "Cancel", exact: true }),
    "Calendar create cancel",
  );
  await expectResponsiveTarget(
    page,
    dialog.getByRole("button", { name: "Create task", exact: true }),
    "Calendar create submit",
  );

  const evidenceDirectory = path.resolve("artifacts/visual-proof/p1/calendar-create");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({
    path: path.join(evidenceDirectory, `calendar-create-${testInfo.project.name}.png`),
    animations: "disabled",
  });
});

test("Habits preserve Editorial Focus across every required responsive viewport", async ({
  page,
}, testInfo) => {
  test.skip(
    !habitVisualProjects.has(testInfo.project.name),
    "One project per required width owns the Habits visual contract.",
  );
  test.setTimeout(240_000);
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });
  await page.goto("/");
  const demoResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await demoResponse).status()).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });

  const evidenceDirectory = path.resolve("artifacts/visual-proof/p3/habits");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.goto("/habits");
  const habitsMain = page.getByRole("main");
  const habitsHeading = habitsMain.getByRole("heading", { level: 1, name: "Habits", exact: true });
  await expect(habitsHeading).toBeVisible();
  await expectUsesSans(habitsHeading, "Habits page heading");
  await expectResponsiveTarget(
    page,
    habitsMain.getByRole("button", { name: "Create habit", exact: true }),
    "Habits create action",
  );
  await expectResponsiveTarget(
    page,
    habitsMain.getByRole("link", { name: "Active", exact: true }),
    "Habits active view",
  );
  await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "habits");

  await habitsMain.getByRole("button", { name: "Create habit", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Create habit" });
  await expect(createDialog).toBeVisible();
  const createTitle = createDialog.getByLabel("Title", { exact: true });
  await expect(createTitle).toBeFocused();
  await expectHabitDialogContract(page, createDialog, "create habit");
  await captureHabitDialogEvidence(
    page,
    createDialog,
    evidenceDirectory,
    `habit-create-${testInfo.project.name}`,
  );

  await createDialog.getByRole("button", { name: "Create habit", exact: true }).click();
  await expectHabitValidationAssociation(createDialog, createTitle);
  await captureHabitDialogEvidence(
    page,
    createDialog,
    evidenceDirectory,
    `habit-create-validation-${testInfo.project.name}`,
  );

  await createDialog.getByRole("combobox", { name: "Schedule", exact: true }).selectOption("weekdays");
  for (const weekday of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
    await expectResponsiveTarget(
      page,
      createDialog.getByRole("checkbox", { name: weekday, exact: true }).locator("xpath=.."),
      `${weekday} habit schedule target`,
    );
  }
  await createDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await habitsMain.getByRole("button", { name: "Create habit", exact: true }).click();
  const offlineDialog = page.getByRole("dialog", { name: "Create habit" });
  const offlineTitle = offlineDialog.getByLabel("Title", { exact: true });
  await offlineTitle.fill("Offline visual draft");
  await page.context().setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(offlineDialog.getByRole("status")).toContainText("Reconnect before saving");
  await expect(offlineDialog.getByRole("button", { name: "Create habit", exact: true })).toBeDisabled();
  await expect(offlineDialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
  await expect(offlineTitle).toHaveValue("Offline visual draft");
  await captureHabitDialogEvidence(
    page,
    offlineDialog,
    evidenceDirectory,
    `habit-create-offline-${testInfo.project.name}`,
  );
  await page.context().setOffline(false);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeHidden();
  await offlineDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/today");
  const todayHabitsHeading = page.getByRole("heading", { level: 2, name: "Habits", exact: true });
  await todayHabitsHeading.scrollIntoViewIfNeeded();
  await expect(todayHabitsHeading).toBeVisible();
  await expectResponsiveTarget(
    page,
    page.getByRole("link", { name: "Manage habits", exact: true }),
    "Today manage habits action",
  );
  await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "today-habits");

  await page.goto(`/habits/${demoHabits.activeBooleanId}`);
  const detailMain = page.getByRole("main");
  const detailHeading = detailMain.getByRole("heading", {
    level: 1,
    name: demoHabits.activeBooleanTitle,
    exact: true,
  });
  await expect(detailHeading).toBeVisible();
  await expectUsesSans(detailHeading, "Habit detail heading");
  await expectResponsiveTarget(
    page,
    detailMain.getByRole("button", { name: "Edit habit", exact: true }),
    "Habit edit action",
  );
  await expect(
    detailMain.getByRole("table", {
      name: new RegExp(`history for ${demoHabits.activeBooleanTitle}`, "u"),
    }),
  ).toBeVisible();
  await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "habit-detail");

  await detailMain.getByRole("button", { name: "Edit habit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit habit" });
  const editTitle = editDialog.getByLabel("Title", { exact: true });
  await expect(editTitle).toHaveValue(demoHabits.activeBooleanTitle);
  await expectHabitDialogContract(page, editDialog, "edit habit");
  await captureHabitDialogEvidence(
    page,
    editDialog,
    evidenceDirectory,
    `habit-edit-${testInfo.project.name}`,
  );

  if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await setDocumentTheme(page, "dark");
    await captureHabitDialogEvidence(
      page,
      editDialog,
      evidenceDirectory,
      `habit-edit-dark-${testInfo.project.name}`,
    );
    await setDocumentTheme(page, "light");

    const current = await readHabitDetail(page, demoHabits.activeBooleanId);
    await updateHabitViaApi(page, demoHabits.activeBooleanId, current.habit.version, { icon: "🌄" });
    const localTitle = `${demoHabits.activeBooleanTitle} locally reviewed`;
    await editTitle.fill(localTitle);
    const conflictResponse = waitForHabitResponse(
      page,
      `/api/v1/habits/${demoHabits.activeBooleanId}`,
      "PATCH",
    );
    await editDialog.getByRole("button", { name: "Save habit", exact: true }).click();
    expect((await conflictResponse).status()).toBe(409);
    await expect(editDialog.getByRole("alert")).toContainText("This habit changed elsewhere");
    const reviewLatest = editDialog.getByRole("button", { name: "Review latest in this form" });
    await expectResponsiveTarget(page, reviewLatest, "Habit conflict review action");
    await expect(editDialog.getByRole("button", { name: "Save habit", exact: true })).toBeDisabled();
    await captureHabitDialogEvidence(
      page,
      editDialog,
      evidenceDirectory,
      `habit-edit-conflict-${testInfo.project.name}`,
    );

    await reviewLatest.click();
    await expect(reviewLatest).toBeHidden();
    await expect(editTitle).toHaveValue(localTitle);
    await expect(editDialog.getByLabel("Icon or emoji", { exact: true })).toHaveValue("🌄");
    await expect(editDialog.getByRole("button", { name: "Save habit", exact: true })).toBeEnabled();
  }
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  const archiveTrigger = detailMain.getByRole("button", { name: "Archive", exact: true });
  await archiveTrigger.click();
  const archiveDialog = page.getByRole("alertdialog", {
    name: `Archive “${demoHabits.activeBooleanTitle}”?`,
    exact: true,
  });
  await expect(archiveDialog).toBeVisible();
  await expect(archiveDialog).toContainText(
    "History will be preserved. This habit will leave Today and your active habits until you restore it.",
  );
  const keepHabit = archiveDialog.getByRole("button", { name: "Keep habit", exact: true });
  await expect(keepHabit).toBeFocused();
  for (const button of await archiveDialog.getByRole("button").all()) {
    await expectResponsiveTarget(page, button, "Habit archive dialog action");
  }
  await captureHabitDialogEvidence(
    page,
    archiveDialog,
    evidenceDirectory,
    `habit-archive-${testInfo.project.name}`,
  );

  if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await setDocumentTheme(page, "dark");
    await captureHabitDialogEvidence(
      page,
      archiveDialog,
      evidenceDirectory,
      `habit-archive-dark-${testInfo.project.name}`,
    );
    await setDocumentTheme(page, "light");
  }
  await keepHabit.click();
  await expect(archiveDialog).toBeHidden();
  await expect(archiveTrigger).toBeFocused();

  if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await setDocumentTheme(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "habit-detail-dark");
  }
});

test("Habit route states fit every required responsive viewport", async ({ page }, testInfo) => {
  test.skip(
    !habitVisualProjects.has(testInfo.project.name),
    "One project per required width owns the Habit route-state contract.",
  );
  test.setTimeout(240_000);
  await signUpThroughUi(page, testInfo);
  const evidenceDirectory = path.resolve("artifacts/visual-proof/p3/habit-states");
  await mkdir(evidenceDirectory, { recursive: true });

  await page.goto("/habits");
  await expect(page.getByRole("heading", { level: 1, name: "Habits", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "No habits yet", exact: true })).toBeVisible();
  await expectResponsiveTarget(
    page,
    page.getByRole("main").getByRole("button", { name: "Create habit", exact: true }).last(),
    "Empty Habits create action",
  );
  await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "habits-empty-active");

  await page.goto("/habits?view=archived");
  await expect(
    page.getByRole("heading", { level: 2, name: "No archived habits", exact: true }),
  ).toBeVisible();
  await expectResponsiveTarget(
    page,
    page.getByRole("link", { name: "Return to active habits", exact: true }),
    "Empty archived Habits return action",
  );
  await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "habits-empty-archived");

  await page.goto("/habits/00000000-0000-4000-8000-000000000099");
  const unavailableHeading = page.getByRole("heading", {
    level: 1,
    name: "Habit unavailable",
    exact: true,
  });
  await expect(unavailableHeading).toBeVisible();
  await expectUsesSans(unavailableHeading, "Habit permission heading");
  await expect(page.getByText("This habit could not be found or you may not have access.")).toBeVisible();
  await expect(page.getByText(demoHabits.activeBooleanTitle, { exact: true })).toHaveCount(0);
  await expectResponsiveTarget(
    page,
    page.getByRole("link", { name: "Back to habits", exact: true }),
    "Habit permission return action",
  );
  await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "habit-permission");

  const localDate = await readHabitLocalDate(page, "Asia/Singapore");
  const stateHabit = await createHabitViaApi(page, {
    title: `Route-state habit ${testInfo.project.name}`,
    icon: "🧭",
    colorToken: "sky",
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

  await page.goto("/inbox");
  const habitsBarrier = await acquireHabitReadBarrier();
  try {
    const habitsLink = page.locator('a[href="/habits"]').first();
    await clickRouteWithEvidenceQuery(habitsLink, "habits-loading");
    const habitWorkspaceLoading = page.getByRole("main").locator('[data-loading-shape="habit-workspace"]');
    await expect(habitWorkspaceLoading).toBeVisible({ timeout: 15_000 });
    await expect(
      habitWorkspaceLoading.getByRole("heading", { level: 1, name: "Habits", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Loading habits" })).toBeVisible();
    await captureHabitRouteStateEvidence(page, testInfo.project.name, evidenceDirectory, "habits-loading");
  } finally {
    await habitsBarrier.release();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Habits", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const detailBarrier = await acquireHabitReadBarrier();
  try {
    await clickRouteWithEvidenceQuery(
      page.getByRole("link", { name: `Open ${stateHabit.habit.title}`, exact: true }),
      "habit-detail-loading",
    );
    const habitDetailLoading = page.getByRole("main").locator('[data-loading-shape="habit-detail"]');
    await expect(habitDetailLoading).toBeVisible({ timeout: 15_000 });
    await expect(
      habitDetailLoading.getByRole("heading", { level: 1, name: "Habit details", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Loading habit details" })).toBeVisible();
    await captureHabitRouteStateEvidence(
      page,
      testInfo.project.name,
      evidenceDirectory,
      "habit-detail-loading",
    );
  } finally {
    await detailBarrier.release();
  }
  await expect(
    page.getByRole("heading", { level: 1, name: stateHabit.habit.title, exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  const releaseDetailFailure = await installHabitApiFailure(page, `/api/v1/habits/${stateHabit.habit.id}`);
  try {
    await triggerStaleHabitRefresh(page);
    await expect(page.getByRole("alert").filter({ hasText: "Habits could not be refreshed" })).toBeVisible();
    await captureHabitRouteStateEvidence(
      page,
      testInfo.project.name,
      evidenceDirectory,
      "habit-detail-error",
    );
    if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
      await setDocumentTheme(page, "dark");
      await captureHabitRouteStateEvidence(
        page,
        testInfo.project.name,
        evidenceDirectory,
        "habit-detail-error-dark",
      );
      await setDocumentTheme(page, "light");
    }
  } finally {
    await releaseDetailFailure();
  }

  await page.goto("/habits");
  const releaseListFailure = await installHabitApiFailure(page, "/api/v1/habits/overviews");
  try {
    await triggerStaleHabitRefresh(page);
    await expect(page.getByRole("alert").filter({ hasText: "Habits could not be refreshed" })).toBeVisible();
    await captureHabitRouteStateEvidence(page, testInfo.project.name, evidenceDirectory, "habits-error");
    if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
      await setDocumentTheme(page, "dark");
      await captureHabitRouteStateEvidence(
        page,
        testInfo.project.name,
        evidenceDirectory,
        "habits-error-dark",
      );
    }
  } finally {
    await releaseListFailure();
  }
});

test("exact occurrence details preserve every released responsive state", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });
  await page.goto("/");
  const demoResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await demoResponse).status()).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  const occurrenceKey = await readOpenDemoOccurrenceKey(page);
  const evidenceDirectory = path.resolve("artifacts/visual-proof/p2/occurrence-details");
  await mkdir(evidenceDirectory, { recursive: true });

  await page.goto(occurrenceDetailPath(occurrenceKey));
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(P2_OCCURRENCE_DEMO.taskTitle);
  const occurrence = selectedOccurrencePanel(page);
  await expect(occurrence.getByRole("heading", { name: "Selected occurrence", exact: true })).toBeVisible();
  await expect(occurrence.getByRole("button", { name: "Complete occurrence", exact: true })).toBeEnabled();
  await expect(occurrence.getByRole("button", { name: "Skip occurrence", exact: true })).toBeEnabled();
  await expectResponsiveTarget(
    page,
    page.getByRole("link", { name: "Back to task list", exact: true }),
    "occurrence details back",
  );
  await captureOccurrenceEvidence(page, testInfo.project.name, evidenceDirectory, "default");

  if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await setDocumentTheme(page, "dark");
    await captureOccurrenceEvidence(page, testInfo.project.name, evidenceDirectory, "default-dark");
    await setDocumentTheme(page, "light");
  }

  if (testInfo.project.name === "desktop-chromium") {
    const initialViewport = page.viewportSize();
    if (!initialViewport) throw new Error("The desktop occurrence audit requires a viewport.");
    await page.setViewportSize({ width: 720, height: 900 });
    await captureOccurrenceEvidence(page, testInfo.project.name, evidenceDirectory, "default-zoom-200");
    await page.setViewportSize(initialViewport);
  }

  await page.context().setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(occurrence.getByRole("button", { name: "Complete occurrence", exact: true })).toBeDisabled();
  await captureOccurrenceEvidence(page, testInfo.project.name, evidenceDirectory, "offline");
  await page.context().setOffline(false);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeHidden();

  await expect(occurrence.getByRole("button", { name: "Complete occurrence", exact: true })).toBeEnabled();
  await applyOccurrenceWithoutDeliveringResponse(page);
  await expect(
    occurrence.getByRole("button", { name: "Retry exact occurrence change", exact: true }),
  ).toBeVisible();
  await expect(
    occurrence.getByRole("button", { name: "Continue with latest state", exact: true }),
  ).toBeVisible();
  await captureOccurrenceEvidence(page, testInfo.project.name, evidenceDirectory, "recovery");

  await page.goto(occurrenceDetailPath(unavailableDemoOccurrenceKey()));
  const unavailable = selectedOccurrencePanel(page);
  await expect(
    unavailable.getByText("This occurrence is no longer available under the current series schedule."),
  ).toBeVisible();
  await expect(unavailable.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
  await captureOccurrenceEvidence(page, testInfo.project.name, evidenceDirectory, "unavailable");
});

test("task-detail route states preserve every released responsive and recovery contract", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });
  await page.goto("/");
  const demoResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await demoResponse).status()).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });

  const userId = await readAuthenticatedUserId(page);
  const occurrenceKey = await readOpenDemoOccurrenceKey(page);
  const occurrencePath = occurrenceDetailPath(occurrenceKey);
  const evidenceDirectory = path.resolve("artifacts/visual-proof/p2/task-route-states");
  await mkdir(evidenceDirectory, { recursive: true });

  try {
    await page.goto(
      `/tasks/00000000-0000-4000-8000-000000000099?${new URLSearchParams({ returnTo: "/today" })}`,
    );
    const permissionHeading = page.getByRole("heading", {
      level: 1,
      name: "Task unavailable",
      exact: true,
    });
    await expect(permissionHeading).toBeVisible();
    await expect(page.getByText("This task could not be found or you may not have access.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to tasks", exact: true })).toHaveAttribute(
      "href",
      "/today",
    );
    await captureTaskRouteStateEvidence(page, testInfo.project.name, evidenceDirectory, "permission");

    await page.goto("/today");
    const occurrenceLink = page
      .locator(`[data-planning-task-id="${P2_OCCURRENCE_DEMO.taskId}"][data-occurrence-state="open"]`)
      .locator("[data-planning-task-open]");
    await expect(occurrenceLink).toBeVisible();
    const barrier = await acquireTaskReadBarrier();
    try {
      await occurrenceLink.evaluate((element) => (element as HTMLElement).click());
      const loadingHeading = page.getByRole("heading", {
        level: 1,
        name: "Opening task details…",
        exact: true,
      });
      await expect(loadingHeading).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-loading-shape="task-detail"]')).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to task list", exact: true })).toHaveAttribute(
        "href",
        "/today",
      );
      await captureTaskRouteStateEvidence(page, testInfo.project.name, evidenceDirectory, "loading");
    } finally {
      await barrier.release();
    }
    await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(P2_OCCURRENCE_DEMO.taskTitle, {
      timeout: 30_000,
    });

    const staleTask = await readTaskForConflict(page, P2_OCCURRENCE_DEMO.taskId);
    await updateTask(page, staleTask, {
      descriptionMd: `Responsive conflict proof ${testInfo.project.name}`,
    });
    const conflictResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/tasks/${P2_OCCURRENCE_DEMO.taskId}/occurrences/transition` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Complete occurrence", exact: true }).click();
    expect((await conflictResponse).status()).toBe(409);
    await expect(selectedOccurrencePanel(page).getByRole("alert")).toContainText(
      "This occurrence changed elsewhere. The latest saved state is shown; review it before trying again.",
    );
    await captureOccurrenceEvidence(page, testInfo.project.name, evidenceDirectory, "conflict");

    await seedOccurrenceAheadOfTask(userId, P2_OCCURRENCE_DEMO.taskId, occurrenceKey);
    await page.goto(occurrencePath);
    const errorHeading = page.getByRole("heading", {
      level: 1,
      name: "Task unavailable",
      exact: true,
    });
    await expect(errorHeading).toBeVisible();
    await expect(errorHeading).toBeFocused();
    await expect(
      page.getByText("Task details could not be loaded. Your data was not changed."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await captureTaskRouteStateEvidence(page, testInfo.project.name, evidenceDirectory, "error");
  } finally {
    await page.goto("about:blank").catch(() => undefined);
    await deleteIsolatedDemoUser(userId);
  }
});

test("every released route reflows at the tablet and minimum-width boundaries", async ({
  page,
}, testInfo) => {
  test.skip(
    !["boundary-768-chromium", "boundary-320-chromium"].includes(testInfo.project.name),
    "The boundary projects own the complete-route reflow audit.",
  );
  test.setTimeout(120_000);
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });
  const evidenceDirectory = path.resolve("artifacts/visual-proof/p0/final-boundaries");
  await mkdir(evidenceDirectory, { recursive: true });

  for (const route of [
    { path: "/", heading: "Make room for what matters.", slug: "landing", display: true },
    { path: "/sign-in", heading: "Welcome back", slug: "sign-in", display: false },
    { path: "/sign-up", heading: "Create your account", slug: "sign-up", display: false },
  ] as const) {
    await page.goto(route.path);
    const heading = page.getByRole("heading", { level: 1, name: route.heading, exact: true });
    await expect(heading).toBeVisible();
    if (!route.display) await expectUsesSans(heading, `${route.slug} heading`);
    await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, route.slug);
  }

  await page.goto("/");
  const demoResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await demoResponse).status()).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  const dismissTips = page.getByRole("button", { name: "Dismiss getting started tips" });
  if (await dismissTips.isVisible()) await dismissTips.click();

  for (const route of [
    { path: "/inbox", heading: "Inbox", slug: "inbox" },
    {
      path: "/lists/20000000-0000-4000-8000-000000000001",
      heading: "Community workshop",
      slug: "list",
    },
    { path: "/completed", heading: "Completed / cancelled", slug: "completed" },
    { path: "/today", heading: "Today", slug: "today" },
    { path: "/upcoming", heading: "Upcoming", slug: "upcoming" },
    { path: "/calendar", heading: "Calendar", slug: "calendar" },
    { path: "/matrix", heading: "Priority matrix", slug: "matrix" },
    { path: "/plan", heading: "AI Review", slug: "ai-review" },
    { path: "/settings", heading: "Settings", slug: "settings" },
  ] as const) {
    await page.goto(route.path);
    const heading = page
      .getByRole("main")
      .getByRole("heading", { level: 1, name: route.heading, exact: true });
    await expect(heading).toBeVisible();
    await expectUsesSans(heading, `${route.slug} heading`);
    if (testInfo.project.name === "boundary-320-chromium") {
      if (route.slug === "list") await expectCompactActionLabel(page, "Add task");
      if (route.slug === "calendar") await expectCalendarInstructionUntruncated(page);
      if (route.slug === "ai-review") await expectPlannerStepLabelsUntruncated(page);
    }
    await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, route.slug);
  }

  await page.goto("/tasks/50000000-0000-4000-8000-000000000001");
  const taskTitle = page.getByLabel("Task title", { exact: true });
  await expect(taskTitle).toHaveValue("Outline the workshop agenda");
  await expectUsesSans(taskTitle, "task detail title");
  await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, "task-details");
});

test("the released proof surfaces reflow at a 200% zoom equivalent and honor reduced motion", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One zoom audit owns this evidence.");
  test.setTimeout(120_000);

  // At 200% browser zoom a 1440 px display exposes roughly 720 CSS px to the page.
  await page.setViewportSize({ width: 720, height: 900 });
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const evidenceDirectory = path.resolve("artifacts/visual-proof/boundaries");
  await mkdir(evidenceDirectory, { recursive: true });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make room for what matters." })).toBeVisible();
  await expectUsesSans(
    page.getByText("Capture tasks quickly, plan them against real time,", { exact: false }),
    "landing body copy",
  );
  const createAccount = page.getByRole("link", { name: "Create account" }).first();
  await createAccount.focus();
  await expect(createAccount).toBeFocused();
  const focusStyle = await createAccount.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle).toEqual({ outlineStyle: "solid", outlineWidth: "2px" });
  await auditZoomSurface(page, evidenceDirectory, "landing");

  await page.getByRole("button", { name: "Try demo" }).click();
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  const dismissTips = page.getByRole("button", { name: "Dismiss getting started tips" });
  if (await dismissTips.isVisible()) await dismissTips.click();

  await page.goto("/today");
  const todayHeading = page.getByRole("heading", { name: "Today", exact: true }).first();
  await expect(todayHeading).toBeVisible();
  await expectUsesSans(todayHeading, "Today heading");
  await auditZoomSurface(page, evidenceDirectory, "today");

  await page.goto("/habits");
  const habitsHeading = page.getByRole("heading", { name: "Habits", exact: true }).first();
  await expect(habitsHeading).toBeVisible();
  await expectUsesSans(habitsHeading, "Habits heading");
  await auditZoomSurface(page, evidenceDirectory, "habits");

  await page.getByRole("main").getByRole("button", { name: "Create habit", exact: true }).click();
  const createHabitDialog = page.getByRole("dialog", { name: "Create habit" });
  await expectHabitDialogContract(page, createHabitDialog, "200% create habit");
  await captureHabitDialogEvidence(page, createHabitDialog, evidenceDirectory, "zoom-200-habit-create");
  await createHabitDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto(`/habits/${demoHabits.activeBooleanId}`);
  const habitDetailHeading = page.getByRole("heading", {
    name: demoHabits.activeBooleanTitle,
    exact: true,
  });
  await expect(habitDetailHeading).toBeVisible();
  await auditZoomSurface(page, evidenceDirectory, "habit-detail");
  await page.getByRole("button", { name: "Edit habit", exact: true }).click();
  const editHabitDialog = page.getByRole("dialog", { name: "Edit habit" });
  await expectHabitDialogContract(page, editHabitDialog, "200% edit habit");
  await captureHabitDialogEvidence(page, editHabitDialog, evidenceDirectory, "zoom-200-habit-edit");
  await editHabitDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/calendar");
  const calendarHeading = page.getByRole("heading", { name: "Calendar", exact: true }).first();
  await expect(calendarHeading).toBeVisible();
  await expectUsesSans(calendarHeading, "Calendar heading");
  await auditZoomSurface(page, evidenceDirectory, "calendar");

  await page.goto("/tasks/50000000-0000-4000-8000-000000000001");
  const taskTitle = page.getByLabel("Task title", { exact: true });
  await expect(taskTitle).toHaveValue("Outline the workshop agenda");
  await expectUsesSans(taskTitle, "task title");
  await expect(page.getByRole("link", { name: "Back to task list" })).toBeVisible();
  await expect(page.getByText("Title is saved")).toBeVisible();
  await auditZoomSurface(page, evidenceDirectory, "task-details");

  await page.goto("/plan");
  const reviewHeading = page.getByRole("heading", { name: "AI Review", exact: true });
  await expect(reviewHeading).toBeVisible();
  await expectUsesSans(reviewHeading, "AI Review heading");
  await auditZoomSurface(page, evidenceDirectory, "ai-review");
});

async function auditZoomSurface(page: Page, evidenceDirectory: string, slug: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const contract = await page.evaluate(() => {
    const milliseconds = (value: string) =>
      value
        .split(",")
        .map((duration) => duration.trim())
        .map((duration) =>
          duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1_000,
        );
    const durations = Array.from(document.querySelectorAll("button, a"))
      .slice(0, 80)
      .flatMap((element) => {
        const style = getComputedStyle(element);
        return [...milliseconds(style.transitionDuration), ...milliseconds(style.animationDuration)];
      });
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      maximumMotionDuration: Math.max(0, ...durations),
    };
  });
  expect(contract.clientWidth).toBe(720);
  expect(contract.scrollWidth, `${slug} horizontal overflow at 200% zoom`).toBeLessThanOrEqual(
    contract.clientWidth + 1,
  );
  expect(contract.reducedMotion).toBe(true);
  expect(contract.maximumMotionDuration).toBeLessThanOrEqual(0.02);
  await page.screenshot({
    path: path.join(evidenceDirectory, `zoom-200-${slug}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

async function expectHabitDialogContract(page: Page, dialog: Locator, label: string) {
  await expect(dialog).toBeVisible();
  await expectHabitDialogFrame(dialog, label);

  for (const button of await dialog.getByRole("button").all()) {
    if (await button.isVisible()) await expectResponsiveTarget(page, button, `${label} action`);
  }
  for (const field of await dialog
    .locator('input:not([type="radio"]):not([type="checkbox"]), select')
    .all()) {
    if (await field.isVisible()) await expectResponsiveTarget(page, field, `${label} field`);
  }
  for (const radio of await dialog.getByRole("radio").all()) {
    if (await radio.isVisible()) {
      await expectResponsiveTarget(page, radio.locator("xpath=.."), `${label} goal choice`);
    }
  }
}

async function expectHabitDialogFrame(dialog: Locator, label: string) {
  const frame = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(frame.rootScrollWidth, `${label} page horizontal overflow`).toBeLessThanOrEqual(
    frame.rootClientWidth + 1,
  );
  expect(frame.scrollWidth, `${label} dialog horizontal overflow`).toBeLessThanOrEqual(frame.clientWidth + 1);
  expect(frame.left).toBeGreaterThanOrEqual(-1);
  expect(frame.right).toBeLessThanOrEqual(frame.viewportWidth + 1);
  expect(frame.top).toBeGreaterThanOrEqual(-1);
  expect(frame.bottom).toBeLessThanOrEqual(frame.viewportHeight + 1);
}

async function expectHabitValidationAssociation(dialog: Locator, field: Locator) {
  const alert = dialog.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  const alertId = await alert.getAttribute("id");
  expect(alertId).toBeTruthy();
  const descriptionIds = (await field.getAttribute("aria-describedby"))?.split(/\s+/u) ?? [];
  expect(descriptionIds).toContain(alertId);
}

async function captureHabitDialogEvidence(
  page: Page,
  dialog: Locator,
  evidenceDirectory: string,
  slug: string,
) {
  await page.evaluate(() => document.fonts.ready);
  await expectHabitDialogFrame(dialog, slug);
  await page.screenshot({
    path: path.join(evidenceDirectory, `${slug}.png`),
    animations: "disabled",
  });
}

async function readHabitDetail(page: Page, habitId: string): Promise<HabitDetailWire> {
  const response = await page.context().request.get(`/api/v1/habits/${habitId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as HabitDetailWire;
}

async function clickRouteWithEvidenceQuery(link: Locator, label: string): Promise<void> {
  await link.evaluate((element, evidence) => {
    if (!(element instanceof HTMLAnchorElement)) throw new Error("Route evidence requires a link.");
    const destination = new URL(element.href);
    destination.searchParams.set("evidence", evidence);
    element.setAttribute("href", `${destination.pathname}${destination.search}`);
    element.click();
  }, `${label}-${randomUUID()}`);
}

async function captureHabitRouteStateEvidence(
  page: Page,
  projectName: string,
  evidenceDirectory: string,
  state: string,
): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const heading = page.getByRole("main").getByRole("heading", { level: 1 }).first();
  await expect(heading).toBeVisible();
  await expectUsesSans(heading, `${state} habit-route heading`);
  const frame = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(frame.scrollWidth, `${state} habit-route horizontal overflow`).toBeLessThanOrEqual(
    frame.clientWidth + 1,
  );
  for (const control of await page.locator("main a, main button, header a, nav a").all()) {
    if (await control.isVisible()) await expectResponsiveTarget(page, control, `${state} habit-route action`);
  }
  await page.screenshot({
    path: path.join(evidenceDirectory, `${state}-${projectName}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

async function captureBoundaryRoute(
  page: Page,
  projectName: string,
  evidenceDirectory: string,
  slug: string,
) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const frame = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(frame.clientWidth).toBe(page.viewportSize()?.width);
  expect(frame.scrollWidth, `${slug} horizontal overflow`).toBeLessThanOrEqual(frame.clientWidth + 1);
  await page.screenshot({
    path: path.join(evidenceDirectory, `${slug}-${projectName}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

async function captureOccurrenceEvidence(
  page: Page,
  projectName: string,
  evidenceDirectory: string,
  state: string,
) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const occurrence = selectedOccurrencePanel(page);
  await expect(occurrence).toBeVisible();
  await occurrence.scrollIntoViewIfNeeded();
  await expectUsesSans(
    occurrence.getByRole("heading", { name: "Selected occurrence" }),
    "occurrence heading",
  );
  const layout = await occurrence.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      left: rect.left,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      right: rect.right,
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.rootScrollWidth, `${state} page horizontal overflow`).toBeLessThanOrEqual(
    layout.rootClientWidth + 1,
  );
  expect(layout.scrollWidth, `${state} occurrence horizontal overflow`).toBeLessThanOrEqual(
    layout.clientWidth + 1,
  );
  expect(layout.left).toBeGreaterThanOrEqual(-1);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.reducedMotion).toBe(true);
  for (const button of await occurrence.getByRole("button").all()) {
    if (await button.isVisible()) await expectResponsiveTarget(page, button, `${state} occurrence action`);
  }
  await page.screenshot({
    path: path.join(evidenceDirectory, `occurrence-${state}-${projectName}.png`),
    animations: "disabled",
  });
}

async function captureTaskRouteStateEvidence(
  page: Page,
  projectName: string,
  evidenceDirectory: string,
  state: "error" | "loading" | "permission",
) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const heading = page.getByRole("main").getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expectUsesSans(heading, `${state} task-route heading`);
  const frame = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(frame.scrollWidth, `${state} task-route horizontal overflow`).toBeLessThanOrEqual(
    frame.clientWidth + 1,
  );
  const controls =
    state === "loading"
      ? page.locator('nav[aria-label="Primary navigation"] a, header a, main a, main button')
      : page.getByRole("main").locator("a, button");
  for (const control of await controls.all()) {
    if (await control.isVisible()) await expectResponsiveTarget(page, control, `${state} task-route action`);
  }
  await page.screenshot({
    path: path.join(evidenceDirectory, `task-route-${state}-${projectName}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

async function expectPlannerStepLabelsUntruncated(page: Page) {
  const labels = page.getByRole("list", { name: "Planning progress" }).locator("strong");
  await expect(labels).toHaveText(["Describe", "Review", "Result"]);
  const clipping = await labels.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return { overflow: style.overflow, textOverflow: style.textOverflow };
    }),
  );
  expect(clipping).toEqual([
    { overflow: "visible", textOverflow: "clip" },
    { overflow: "visible", textOverflow: "clip" },
    { overflow: "visible", textOverflow: "clip" },
  ]);
}

async function expectCompactActionLabel(page: Page, name: string) {
  const action = page.getByRole("main").locator("header").first().getByRole("button", { name, exact: true });
  await expect(action).toBeVisible();
  const style = await action.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { flexShrink: computed.flexShrink, whiteSpace: computed.whiteSpace };
  });
  expect(style).toEqual({ flexShrink: "0", whiteSpace: "nowrap" });
}

async function expectCalendarInstructionUntruncated(page: Page) {
  const instruction = page.getByText(
    "Choose any visible task, then open the complete date, time, and timezone form.",
    { exact: true },
  );
  await expect(instruction).toBeVisible();
  const clipping = await instruction.evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflow: style.overflow, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace };
  });
  expect(clipping).toEqual({ overflow: "visible", textOverflow: "clip", whiteSpace: "normal" });
}

async function assertMobileTouchContracts(page: Page, taskId: string) {
  const searchTrigger = page.getByRole("button", {
    name: "Search tasks and commands (Command or Control K)",
  });
  await expect(searchTrigger).toBeVisible();
  await expectTouchTarget(searchTrigger, "command search trigger");

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar", exact: true }).first()).toBeVisible();
  const calendarControls = page.locator('[aria-label="Calendar controls"]');
  const rangeLabel = calendarControls.locator("strong");
  await expect(rangeLabel).toBeVisible();
  const rangeContract = await rangeLabel.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    text: element.textContent?.trim() ?? "",
  }));
  expect(rangeContract.text).toMatch(/\d{4}.*\d{4}/u);
  expect(rangeContract.scrollWidth, "calendar range label truncates").toBeLessThanOrEqual(
    rangeContract.clientWidth + 1,
  );

  for (const view of ["Month", "Week", "Day", "Agenda"] as const) {
    await expectTouchTarget(page.getByRole("button", { name: view, exact: true }), `${view} calendar view`);
  }

  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByLabel("Task title", { exact: true })).toBeVisible();
  await expectTouchTarget(
    page.getByRole("combobox", { name: "Priority", exact: true }),
    "task priority select",
  );
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has a bounding box`).not.toBeNull();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function expectResponsiveTarget(page: Page, locator: Locator, label: string) {
  const minimum = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const token = matchMedia("(max-width: 767px), (any-pointer: coarse)").matches
      ? "--control-target-touch"
      : "--control-target-desktop";
    return Number.parseFloat(root.getPropertyValue(token));
  });
  const box = await locator.boundingBox();
  expect(box, `${label} has a bounding box`).not.toBeNull();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(minimum);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(minimum);
}

async function expectUsesSans(locator: Locator, label: string) {
  const contract = await locator.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.fontFamily = "var(--font-sans)";
    document.body.append(probe);
    const tokenFontFamily = getComputedStyle(probe).fontFamily.replace(/\s+/g, " ");
    probe.remove();
    return {
      elementFontFamily: getComputedStyle(element).fontFamily.replace(/\s+/g, " "),
      tokenFontFamily,
    };
  });
  expect(contract.elementFontFamily, `${label} must use the working sans face`).toBe(
    contract.tokenFontFamily,
  );
}

function selectedOccurrencePanel(page: Page) {
  return page.locator('section[aria-labelledby^="occurrence-title-"]');
}

async function setDocumentTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((nextTheme) => {
    localStorage.setItem("opentask-theme-preference", nextTheme);
    document.documentElement.dataset.themePreference = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
  }, theme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

function pixels(value: string) {
  return Number.parseFloat(value);
}

function isolatedClientAddress() {
  const seed = randomUUID().replaceAll("-", "");
  return `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
}
