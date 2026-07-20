import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

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
import { updateTask } from "./support/wp03-tasks";

const demo = {
  listId: "20000000-0000-4000-8000-000000000001",
  recurringTaskId: P2_OCCURRENCE_DEMO.taskId,
  recurringTaskTitle: P2_OCCURRENCE_DEMO.taskTitle,
  scheduledTaskId: "50000000-0000-4000-8000-000000000001",
  scheduledTaskTitle: "Outline the workshop agenda",
} as const;

const publicRoutes = [
  { path: "/", heading: "Make room for what matters." },
  { path: "/sign-in", heading: "Welcome back" },
  { path: "/sign-up", heading: "Create your account" },
] as const;

const additionalTaskRoutes = [
  { path: `/lists/${demo.listId}`, heading: "Community workshop" },
  { path: "/completed", heading: "Completed / cancelled" },
  { path: "/settings", heading: "Settings" },
] as const;

const planningRoutes = [
  { path: "/today", heading: "Today" },
  { path: "/upcoming", heading: "Upcoming" },
  { path: "/matrix", heading: "Priority matrix" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("public landing and authentication routes pass the serious accessibility gate", async ({ page }) => {
  for (const route of publicRoutes) await auditRoute(page, route);
});

test("a theme switch never exposes transitional primary-action contrast", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One browser samples the transient theme frames.");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("opentask-theme-preference", "light"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("navigation", { name: "Public navigation" }).getByRole("link", { name: "Create account" }),
  ).toBeVisible();

  const result = await page.evaluate(async () => {
    const toggle = document.querySelector('[aria-label="Use dark theme"]');
    const primaryAction = document.querySelector('header a[href="/sign-up"].primary-button');
    if (!(toggle instanceof HTMLButtonElement) || !(primaryAction instanceof HTMLElement)) {
      throw new Error("The landing theme controls are unavailable.");
    }

    function contrastRatio(foreground: string, background: string) {
      const foregroundChannels = foreground
        .match(/[\d.]+/gu)
        ?.slice(0, 3)
        .map(Number);
      const backgroundChannels = background
        .match(/[\d.]+/gu)
        ?.slice(0, 3)
        .map(Number);
      if (!foregroundChannels || !backgroundChannels) return 0;
      const luminance = (channels: number[]) => {
        const linear = channels.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
      };
      const foregroundLuminance = luminance(foregroundChannels);
      const backgroundLuminance = luminance(backgroundChannels);
      const lighter = Math.max(foregroundLuminance, backgroundLuminance);
      const darker = Math.min(foregroundLuminance, backgroundLuminance);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function sample(element: HTMLElement) {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        foreground: style.color,
        ratio: contrastRatio(style.color, style.backgroundColor),
      };
    }

    toggle.click();
    const samples = [sample(primaryAction)];
    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(sample(primaryAction));
    }
    return { samples, theme: document.documentElement.dataset.theme };
  });

  expect(result.theme).toBe("dark");
  expect(result.samples).toHaveLength(9);
  for (const sample of result.samples) expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
});

test("the public system theme follows live OS color-scheme changes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One browser proves the system preference bridge.");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("opentask-theme-preference", "system"));
  await page.goto("/");

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme-preference", "system");
  await expect(root).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).not.toHaveAttribute("data-theme-transition");

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("data-theme-preference", "system");
});

test("saved reduced motion reaches a portaled dialog when the OS allows motion", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop portal proves global coverage.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await enterIsolatedDemo(page, testInfo);
  await openRoute(page, { path: "/settings", heading: "Settings" });

  const reduceMotion = page.getByRole("checkbox", { name: /Reduce motion/u });
  await reduceMotion.check();
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);

  await page.goto(`/tasks/${demo.scheduledTaskId}`);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(demo.scheduledTaskTitle);
  await page.getByRole("button", { name: "Delete task…", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: `Delete “${demo.scheduledTaskTitle}”?` });
  const keepTask = dialog.getByRole("button", { name: "Keep task" });
  await expect(dialog).toBeVisible();
  await expect(keepTask).toBeFocused();

  const portalMotion = await keepTask.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      insideShell: element.closest("[data-mobile-navigation]") !== null,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(portalMotion.insideShell).toBe(false);
  expect(maximumCssTimeMs(portalMotion.transitionDuration)).toBeLessThanOrEqual(0.01);
  expect(maximumCssTimeMs(portalMotion.animationDuration)).toBeLessThanOrEqual(0.01);
  await expectNoSevereViolations(page, '[role="alertdialog"]');
  await keepTask.click();
  await expect(dialog).toBeHidden();
});

test("one isolated demo covers the implemented baseline accessibility surface", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await enterIsolatedDemo(page, testInfo);

  const dismissTips = page.getByRole("button", { name: "Dismiss getting started tips" });
  await expect(dismissTips).toBeVisible();
  await expectNoSevereViolations(page);
  await dismissTips.click();
  await expect(dismissTips).toBeHidden();
  await expectNoSevereViolations(page);

  await auditQuickAddDraft(page);
  await auditCommandPalette(page);

  for (const route of additionalTaskRoutes) await auditRoute(page, route);
  for (const route of planningRoutes) await auditRoute(page, route);

  await auditCalendar(page);
  await auditSeededTaskDetails(page);
  await auditSeededRecurrenceDetails(context, page);
  await auditNoKeyPlanner(page);
  await auditOfflineWorkspace(context, page);
});

test("exact occurrence details expose every recovery state to the accessibility gate", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await enterIsolatedDemo(page, testInfo);
  const occurrenceKey = await readOpenDemoOccurrenceKey(page);

  await page.goto(occurrenceDetailPath(occurrenceKey));
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(P2_OCCURRENCE_DEMO.taskTitle);
  const occurrence = selectedOccurrencePanel(page);
  await expect(occurrence.getByRole("heading", { name: "Selected occurrence", exact: true })).toBeVisible();
  await expect(occurrence.getByRole("button", { name: "Complete occurrence", exact: true })).toBeEnabled();
  await expect(occurrence.getByRole("button", { name: "Skip occurrence", exact: true })).toBeEnabled();
  await expectNoSevereViolations(page);
  await expectNoPageOverflow(page, "exact occurrence default");

  if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await setDocumentTheme(page, "dark");
    await expectNoSevereViolations(page);
    await expectNoPageOverflow(page, "exact occurrence dark");
    await setDocumentTheme(page, "light");
  }

  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(occurrence.getByRole("button", { name: "Complete occurrence", exact: true })).toBeDisabled();
  await expect(occurrence.getByRole("button", { name: "Skip occurrence", exact: true })).toBeDisabled();
  await expect(occurrence.getByRole("status")).toContainText("Reconnect to change this occurrence.");
  await expectNoSevereViolations(page);
  await context.setOffline(false);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeHidden();

  await expect(occurrence.getByRole("button", { name: "Complete occurrence", exact: true })).toBeEnabled();
  await applyOccurrenceWithoutDeliveringResponse(page);
  await expect(occurrence.getByRole("alert")).toContainText(
    "The occurrence-change outcome could not be confirmed",
  );
  await expect(
    occurrence.getByRole("button", { name: "Retry exact occurrence change", exact: true }),
  ).toBeVisible();
  await expect(
    occurrence.getByRole("button", { name: "Continue with latest state", exact: true }),
  ).toBeVisible();
  await expectNoSevereViolations(page);

  await page.goto(occurrenceDetailPath(unavailableDemoOccurrenceKey()));
  const unavailable = selectedOccurrencePanel(page);
  await expect(
    unavailable.getByText("This occurrence is no longer available under the current series schedule."),
  ).toBeVisible();
  await expect(unavailable.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
  await expect(unavailable.getByRole("button", { name: "Complete occurrence", exact: true })).toHaveCount(0);
  await expectNoSevereViolations(page);
  await expectNoPageOverflow(page, "exact occurrence unavailable");
});

test("task-detail loading, error, permission, and conflict states pass the accessibility gate", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await enterIsolatedDemo(page, testInfo);
  const userId = await readAuthenticatedUserId(page);
  const occurrenceKey = await readOpenDemoOccurrenceKey(page);
  const occurrencePath = occurrenceDetailPath(occurrenceKey);

  try {
    await page.goto(
      `/tasks/00000000-0000-4000-8000-000000000099?${new URLSearchParams({ returnTo: "/today" })}`,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Task unavailable", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("This task could not be found or you may not have access.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to tasks", exact: true })).toHaveAttribute(
      "href",
      "/today",
    );
    await expectNoSevereViolations(page);
    await expectNoPageOverflow(page, "task-detail permission");

    await page.goto("/today");
    const occurrenceLink = page
      .locator(`[data-planning-task-id="${P2_OCCURRENCE_DEMO.taskId}"][data-occurrence-state="open"]`)
      .locator("[data-planning-task-open]");
    await expect(occurrenceLink).toBeVisible();
    const barrier = await acquireTaskReadBarrier();
    try {
      await occurrenceLink.evaluate((element) => (element as HTMLElement).click());
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Opening task details…",
          exact: true,
        }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-loading-shape="task-detail"]')).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to task list", exact: true })).toHaveAttribute(
        "href",
        "/today",
      );
      await expectNoSevereViolations(page);
      await expectNoPageOverflow(page, "task-detail loading");
    } finally {
      await barrier.release();
    }
    await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(P2_OCCURRENCE_DEMO.taskTitle, {
      timeout: 30_000,
    });

    const staleTask = await readTaskForConflict(page, P2_OCCURRENCE_DEMO.taskId);
    await updateTask(page, staleTask, {
      descriptionMd: `Accessibility conflict proof ${testInfo.project.name}`,
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
    await expectNoSevereViolations(page);
    await expectNoPageOverflow(page, "task-detail conflict");

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
    await expectNoSevereViolations(page);
    await expectNoPageOverflow(page, "task-detail error");
  } finally {
    await page.goto("about:blank").catch(() => undefined);
    await deleteIsolatedDemoUser(userId);
  }
});

test("every released route keeps its accessibility contract in the dark theme", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name),
    "Desktop and mobile own the complete dark-theme route audit.",
  );
  test.setTimeout(180_000);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });

  for (const route of publicRoutes) {
    await auditRoute(page, route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoPageOverflow(page, route.path);
  }

  await enterIsolatedDemo(page, testInfo);
  const dismissTips = page.getByRole("button", { name: "Dismiss getting started tips" });
  if (await dismissTips.isVisible()) await dismissTips.click();

  for (const route of [
    { path: "/inbox", heading: "Inbox" },
    ...additionalTaskRoutes,
    ...planningRoutes,
    { path: "/calendar", heading: "Calendar" },
    { path: "/plan", heading: "AI Review" },
  ] as const) {
    await auditRoute(page, route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoPageOverflow(page, route.path);
  }

  await page.goto(`/tasks/${demo.scheduledTaskId}`);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(demo.scheduledTaskTitle);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoSevereViolations(page);
  await expectNoPageOverflow(page, "/tasks/[taskId]");
});

async function auditRoute(page: Page, route: Readonly<{ path: string; heading: string }>) {
  await openRoute(page, route);
  await expectNoSevereViolations(page);
}

async function openRoute(page: Page, route: Readonly<{ path: string; heading: string }>) {
  await page.goto(route.path);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1, name: route.heading, exact: true }),
  ).toBeVisible();
}

async function enterIsolatedDemo(page: Page, testInfo: TestInfo) {
  const seed = randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto("/");

  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await responsePromise).status(), `${testInfo.project.name} demo entry`).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
}

async function auditQuickAddDraft(page: Page) {
  const input = page.getByLabel("New task", { exact: true });
  const composer = page.locator("form").filter({ has: input });
  await input.fill("Unsaved accessibility draft");
  await expect(input).toHaveValue("Unsaved accessibility draft");
  await expect(composer.getByRole("button", { name: "Add task", exact: true })).toBeEnabled();
  await expectNoSevereViolations(page);
  await input.press("Escape");
  await expect(input).toHaveValue("");
}

async function auditCommandPalette(page: Page) {
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Search tasks and commands" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("option", { name: /Inbox/u })).toBeVisible();
  await expectNoSevereViolations(page, '[role="dialog"]');
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
}

async function auditCalendar(page: Page) {
  await openRoute(page, { path: "/calendar", heading: "Calendar" });
  const taskSelector = page.getByLabel("Task to edit");
  await expect(taskSelector).toBeVisible();

  const addTask = page.getByRole("button", { name: "Add task", exact: true });
  await addTask.click();
  const createDialog = page.getByRole("dialog", { name: "Create scheduled task" });
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByLabel("Task title", { exact: true })).toBeFocused();
  await expect(createDialog.getByRole("combobox", { name: "List", exact: true })).toBeVisible();
  await expect(createDialog.getByRole("combobox", { name: "Priority", exact: true })).toBeVisible();
  await expect(createDialog.getByRole("checkbox", { name: "All-day schedule" })).toBeChecked();
  await expectNoSevereViolations(page, '[role="dialog"]');
  await createDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(createDialog).toBeHidden();
  await expect(addTask).toBeFocused();

  for (const view of ["Month", "Week", "Day", "Agenda"] as const) {
    const button = page.getByRole("button", { name: view, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`[data-view="${view.toLowerCase()}"]`)).toBeVisible();
    await expectNoSevereViolations(page);
  }

  const firstAvailableTask = taskSelector.locator('option:not([value=""])').first();
  await expect(firstAvailableTask).toBeAttached();
  const firstAvailableTaskId = await firstAvailableTask.getAttribute("value");
  expect(firstAvailableTaskId).toBeTruthy();
  if (!firstAvailableTaskId) throw new Error("The visible calendar range has no schedulable task.");
  await taskSelector.selectOption(firstAvailableTaskId);
  await page.getByRole("button", { name: "Edit schedule", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit schedule" });
  await expect(dialog).toBeVisible();
  await expectNoSevereViolations(page, '[role="dialog"]');
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
}

async function auditSeededTaskDetails(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await page.goto(`/lists/${demo.listId}?task=${demo.scheduledTaskId}`);
    const inspector =
      (page.viewportSize()?.width ?? 0) >= 1280
        ? page.getByRole("complementary", { name: "Task details" })
        : page.getByRole("dialog", { name: "Task details" });
    await expect(inspector).toBeVisible();
    await expect(inspector.getByLabel("Task title", { exact: true })).toHaveValue(demo.scheduledTaskTitle);
    await expectNoSevereViolations(
      page,
      (page.viewportSize()?.width ?? 0) >= 1280 ? undefined : '[role="dialog"]',
    );
  }

  await page.goto(`/tasks/${demo.scheduledTaskId}`);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(demo.scheduledTaskTitle);
  await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
  await expectNoSevereViolations(page);

  const actions = page.getByRole("button", { name: `More actions for ${demo.scheduledTaskTitle}` });
  await actions.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expectNoSevereViolations(page, '[role="menu"]');
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Edit schedule", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Specific time" })).toBeChecked();
  await expectNoSevereViolations(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
}

async function auditSeededRecurrenceDetails(context: BrowserContext, page: Page) {
  await page.goto(`/tasks/${demo.recurringTaskId}`);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(demo.recurringTaskTitle);
  const recurrence = page.locator('section[aria-labelledby^="recurrence-title-"]');
  await expect(recurrence.getByRole("heading", { name: "Recurrence", exact: true })).toBeVisible();
  await expect(recurrence.getByRole("button", { name: "Edit recurrence" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(recurrence.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeDisabled();
  await expectNoSevereViolations(page);

  await recurrence.getByRole("button", { name: "Edit recurrence" }).click();
  await expect(recurrence.getByRole("combobox", { name: "Cadence", exact: true })).toHaveValue("daily");
  await expectNoSevereViolations(page);
  await recurrence.getByRole("button", { name: "Cancel", exact: true }).click();

  await recurrence.getByRole("button", { name: "End recurrence…" }).click();
  const dialog = page.getByRole("alertdialog", { name: "End future recurrence?" });
  await expect(dialog.getByRole("button", { name: "Keep current series" })).toBeFocused();
  await expectNoSevereViolations(page, '[role="alertdialog"]');
  await dialog.getByRole("button", { name: "Keep current series" }).click();

  await context.setOffline(true);
  await expect(page.getByText("Task details are read-only while you’re offline.")).toBeVisible();
  await expect(recurrence.getByRole("button", { name: "Edit recurrence" })).toBeDisabled();
  await expectNoSevereViolations(page);
  await context.setOffline(false);
}

async function auditNoKeyPlanner(page: Page) {
  await openRoute(page, { path: "/plan", heading: "AI Review" });
  await expect(
    page.getByRole("heading", {
      name: "Planning is unavailable because no AI key is configured",
      exact: true,
    }),
  ).toBeVisible();
  await expectNoSevereViolations(page);
}

async function auditOfflineWorkspace(context: BrowserContext, page: Page) {
  await auditRoute(page, { path: "/inbox", heading: "Inbox" });
  await context.setOffline(true);
  const banner = page.getByText("You’re offline. Writes are disabled until you reconnect.");
  await expect(banner).toBeVisible();
  await expect(page.getByLabel("New task", { exact: true })).toBeDisabled();
  await expectNoSevereViolations(page);
  await context.setOffline(false);
  await expect(banner).toBeHidden();
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

async function expectNoSevereViolations(page: Page, activeOverlay?: string) {
  const builder = new AxeBuilder({ page });
  // Radix overlays intentionally aria-hide their inert, focus-trapped background. Axe audits the active
  // accessible subtree here; keyboard tests separately own focus containment, so this is not a rule waiver.
  if (activeOverlay) builder.include(activeOverlay);
  const results = await builder.analyze();
  const severeViolations = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(severeViolations).toEqual([]);
}

async function expectNoPageOverflow(page: Page, route: string) {
  const frame = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(frame.scrollWidth, `${route} horizontal overflow`).toBeLessThanOrEqual(frame.clientWidth + 1);
}

function maximumCssTimeMs(value: string) {
  return Math.max(
    ...value.split(",").map((part) => {
      const duration = part.trim();
      const numeric = Number.parseFloat(duration);
      return duration.endsWith("ms") ? numeric : numeric * 1000;
    }),
  );
}
