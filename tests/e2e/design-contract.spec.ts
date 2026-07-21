import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { enterWorkspaceThroughUi, postDemoFromPage } from "./support/wp01-auth";
import { assertPriorityMarkers, readBaseTaskRowContract } from "./support/task-row-contract";
import { addTagToTask, quickAddTask, taskRow, updateTask } from "./support/wp03-tasks";

test("production TaskRow preserves the approved density, typography, and action targets", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await enterWorkspaceThroughUi(page, testInfo);
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

test("direct app launch keeps profile setup usable inside every boundary viewport", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const flow = page.getByRole("region", { name: "Omplish onboarding" });
  await expect(flow).toBeVisible();
  const message = page.getByRole("status").first();
  await expect(message).toBeVisible();
  const messageTypography = await message.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight };
  });
  expect(messageTypography.fontFamily).toContain("editorialFont");
  expect(Number.parseFloat(messageTypography.fontSize)).toBeGreaterThanOrEqual(24);

  const nameInput = page.getByLabel("Your name", { exact: true });
  await expect(nameInput).toBeVisible({ timeout: 10_000 });

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.clientWidth).toBe(page.viewportSize()?.width);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

  const ctaLayout = await nameInput.evaluate((input) => {
    const inputRect = input.getBoundingClientRect();
    const targetSize = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--control-target-touch"),
    );
    return {
      actionHeight: inputRect.height,
      targetSize,
    };
  });
  expect(ctaLayout.actionHeight).toBeGreaterThanOrEqual(ctaLayout.targetSize);

  const evidenceDirectory = path.resolve("artifacts/visual-proof/boundaries");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDirectory, `app-launch-${testInfo.project.name}.png`),
    animations: "disabled",
    fullPage: true,
  });
  await page.evaluate(() => {
    localStorage.setItem("omplish-theme-preference", "dark");
    document.documentElement.dataset.themePreference = "dark";
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({
    path: path.join(evidenceDirectory, `app-launch-dark-${testInfo.project.name}.png`),
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
  expect(await postDemoFromPage(page)).toBe(200);
  await page.goto("/inbox");

  await assertMobileTouchContracts(page, "50000000-0000-4000-8000-000000000001");
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

  for (const route of [{ path: "/", slug: "app-launch" }] as const) {
    await page.goto(route.path);
    await expect(page.getByRole("region", { name: "Omplish onboarding" })).toBeVisible();
    await captureBoundaryRoute(page, testInfo.project.name, evidenceDirectory, route.slug);
  }

  expect(await postDemoFromPage(page)).toBe(200);
  await page.goto("/inbox");
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  const dismissTips = page.getByRole("button", { name: "Dismiss getting started tips" });
  if (await dismissTips.isVisible()) await dismissTips.click();

  for (const route of [
    { path: "/inbox", heading: "Inbox", slug: "inbox" },
    {
      path: "/lists/20000000-0000-4000-8000-000000000001",
      heading: "Hackathon launch",
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
  await expect(taskTitle).toHaveValue("Record the two-minute demo");
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
  const profileInput = page.getByLabel("Your name", { exact: true });
  await expect(profileInput).toBeVisible({ timeout: 10_000 });
  await expectUsesSans(profileInput, "onboarding name field");
  await profileInput.focus();
  await expect(profileInput).toBeFocused();
  const focusStyle = await profileInput.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle).toEqual({ outlineStyle: "none", outlineWidth: "0px" });
  await auditZoomSurface(page, evidenceDirectory, "app-launch");

  expect(await postDemoFromPage(page)).toBe(200);
  await page.goto("/inbox");
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
  await expect(taskTitle).toHaveValue("Record the two-minute demo");
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
