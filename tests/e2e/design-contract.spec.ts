import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { signUpThroughUi } from "./support/wp01-auth";
import { assertPriorityMarkers, readBaseTaskRowContract } from "./support/task-row-contract";
import { addTagToTask, quickAddTask, taskRow, updateTask } from "./support/wp03-tasks";

const calendarCreateProjects = new Set([
  "desktop-chromium",
  "tablet-chromium",
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

test("the five proof surfaces reflow at a 200% zoom equivalent and honor reduced motion", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One zoom audit owns this evidence.");
  test.setTimeout(60_000);

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

function pixels(value: string) {
  return Number.parseFloat(value);
}

function isolatedClientAddress() {
  const seed = randomUUID().replaceAll("-", "");
  return `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
}
