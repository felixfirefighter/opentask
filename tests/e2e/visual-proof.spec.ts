import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

const DEMO_TASK_ID = "50000000-0000-4000-8000-000000000001";
const DEMO_LIST_ID = "20000000-0000-4000-8000-000000000001";

const publicAuthRoutes = [
  { slug: "sign-in", path: "/sign-in", heading: "Welcome back" },
  { slug: "sign-up", path: "/sign-up", heading: "Create your account" },
] as const;

const authenticatedRoutes = [
  { slug: "inbox", path: "/inbox", heading: "Inbox" },
  { slug: "list", path: `/lists/${DEMO_LIST_ID}`, heading: "Community workshop" },
  { slug: "completed", path: "/completed", heading: "Completed / cancelled" },
  { slug: "today", path: "/today", heading: "Today" },
  { slug: "upcoming", path: "/upcoming", heading: "Upcoming" },
  { slug: "calendar", path: "/calendar", heading: "Calendar" },
  { slug: "matrix", path: "/matrix", heading: "Priority matrix" },
  { slug: "settings", path: "/settings", heading: "Settings" },
] as const;

test("the friend-candidate journey renders at every approved viewport", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const evidenceDirectory = path.resolve(process.env.PLAYWRIGHT_VISUAL_PROOF_DIR ?? "artifacts/visual-proof");
  const captureDirectory = path.join(
    tmpdir(),
    `opentask-visual-proof-${testInfo.project.name}-${randomUUID()}`,
  );
  await mkdir(captureDirectory, { recursive: true });
  await page.setExtraHTTPHeaders({ "x-real-ip": isolatedClientAddress() });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make room for what matters." })).toBeVisible();
  await captureRoute(page, testInfo, captureDirectory, "landing");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await captureRoute(page, testInfo, captureDirectory, "landing-dark");
  await page.getByRole("button", { name: "Use light theme" }).click();

  for (const route of publicAuthRoutes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
    await captureRoute(page, testInfo, captureDirectory, route.slug);
    if (route.slug === "sign-in") {
      await setDocumentTheme(page, "dark");
      await captureRoute(page, testInfo, captureDirectory, "sign-in-dark");
      await setDocumentTheme(page, "light");
    }
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make room for what matters." })).toBeVisible();

  await page.getByRole("button", { name: "Try demo" }).click();
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  const dismissTips = page.getByRole("button", { name: "Dismiss getting started tips" });
  await expect(dismissTips).toBeVisible();
  await dismissTips.click();
  await expect(dismissTips).toBeHidden();

  for (const route of authenticatedRoutes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true }).first()).toBeVisible();
    if (route.slug === "calendar") await expectCalendarInstructionUntruncated(page);
    await captureRoute(page, testInfo, captureDirectory, route.slug);
    if (route.slug === "today" || route.slug === "settings") {
      await setDocumentTheme(page, "dark");
      await captureRoute(page, testInfo, captureDirectory, `${route.slug}-dark`);
      await setDocumentTheme(page, "light");
    }
  }

  const taskDetailsPath =
    page.viewportSize()!.width >= 768
      ? `/lists/${DEMO_LIST_ID}?task=${DEMO_TASK_ID}`
      : `/tasks/${DEMO_TASK_ID}`;
  await page.goto(taskDetailsPath);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("Outline the workshop agenda");
  if (page.viewportSize()!.width >= 1280) {
    const details = page.getByRole("complementary", { name: "Task details" });
    await expect(details).toBeVisible();
    await expect(details.getByRole("button", { name: "Edit schedule" })).toBeVisible();
  } else if (page.viewportSize()!.width >= 768) {
    const details = page.getByRole("dialog", { name: "Task details" });
    await expect(details).toBeVisible();
    await expect(details.getByRole("button", { name: "Edit schedule" })).toBeVisible();
  } else {
    await expect(page.getByRole("link", { name: "Back to task list" })).toBeVisible();
  }
  await captureRoute(page, testInfo, captureDirectory, "task-details");

  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "AI Review", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Planning is unavailable because no AI key is configured" }),
  ).toBeVisible();
  await captureRoute(page, testInfo, captureDirectory, "ai-review-no-key");

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await page.context().setOffline(true);
  const offlineStatus = page
    .getByRole("status")
    .filter({ hasText: "You’re offline. Writes are disabled until you reconnect." });
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(offlineStatus).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await captureRoute(page, testInfo, captureDirectory, "inbox-offline");
  await page.context().setOffline(false);
  await page.close();
  await publishEvidence(captureDirectory, evidenceDirectory);
});

async function captureRoute(page: Page, testInfo: TestInfo, captureDirectory: string, slug: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement?.tagName === "H1") (document.activeElement as HTMLElement).blur();
    window.scrollTo(0, 0);
  });

  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const expectedWidth =
    testInfo.project.name === "desktop-chromium"
      ? 1440
      : testInfo.project.name.includes("tablet")
        ? 1024
        : 390;
  expect(page.viewportSize()?.width).toBe(expectedWidth);
  expect(viewport.width).toBe(expectedWidth);
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);

  await page.screenshot({
    path: path.join(captureDirectory, `${slug}-${testInfo.project.name}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

async function publishEvidence(captureDirectory: string, evidenceDirectory: string) {
  await mkdir(evidenceDirectory, { recursive: true });
  const files = (await readdir(captureDirectory)).filter((file) => file.endsWith(".png"));
  await Promise.all(
    files.map((file) => copyFile(path.join(captureDirectory, file), path.join(evidenceDirectory, file))),
  );
}

async function expectCalendarInstructionUntruncated(page: Page) {
  const instruction = page
    .getByRole("main")
    .getByText("Choose any visible task, then open the complete date, time, and timezone form.", {
      exact: true,
    });
  await expect(instruction).toBeVisible();
  const style = await instruction.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      overflow: computed.overflow,
      textOverflow: computed.textOverflow,
      whiteSpace: computed.whiteSpace,
    };
  });
  expect(style).toEqual({ overflow: "visible", textOverflow: "clip", whiteSpace: "normal" });
}

async function setDocumentTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((nextTheme) => {
    localStorage.setItem("opentask-theme-preference", nextTheme);
    document.documentElement.dataset.themePreference = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
  }, theme);
}

function isolatedClientAddress() {
  const seed = randomUUID().replaceAll("-", "");
  return `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
}
