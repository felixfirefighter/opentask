import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const demo = {
  listId: "20000000-0000-4000-8000-000000000001",
  scheduledTaskId: "50000000-0000-4000-8000-000000000001",
  scheduledTaskTitle: "Record the two-minute demo",
} as const;

const publicRoutes = [
  { path: "/", heading: "Make room for what matters." },
  { path: "/sign-in", heading: "Welcome back" },
  { path: "/sign-up", heading: "Create your account" },
] as const;

const additionalTaskRoutes = [
  { path: `/lists/${demo.listId}`, heading: "Hackathon launch" },
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

test("one isolated demo covers the deadline-safe core accessibility surface", async ({
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
  await auditNoKeyPlanner(page);
  await auditOfflineWorkspace(context, page);
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

function maximumCssTimeMs(value: string) {
  return Math.max(
    ...value.split(",").map((part) => {
      const duration = part.trim();
      const numeric = Number.parseFloat(duration);
      return duration.endsWith("ms") ? numeric : numeric * 1000;
    }),
  );
}
