import { expect, test } from "@playwright/test";
import path from "node:path";

const routes = [
  { slug: "landing", path: "/", heading: "Make room for what matters." },
  { slug: "today", path: "/today", heading: "Today" },
  { slug: "calendar", path: "/calendar", heading: "Calendar" },
  { slug: "task-details", path: "/tasks/demo", heading: null },
  { slug: "plan-review", path: "/plan", heading: "Review your proposal" },
] as const;

for (const route of routes) {
  test(`${route.slug} renders without viewport overflow`, async ({ page }, testInfo) => {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    if (route.heading)
      await expect(page.getByRole("heading", { name: route.heading, exact: true }).first()).toBeVisible();
    else await expect(page.getByLabel("Task title")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const expectedWidth =
      testInfo.project.name === "desktop-chromium"
        ? 1440
        : testInfo.project.name.includes("tablet")
          ? 1024
          : 390;
    expect(page.viewportSize()?.width).toBe(expectedWidth);
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);

    await page.screenshot({
      path: path.resolve("artifacts/visual-proof", `${route.slug}-${testInfo.project.name}.png`),
      animations: "disabled",
    });

    if (route.slug === "today" && !testInfo.project.name.includes("tablet")) {
      await page.getByRole("button", { name: "Use dark theme" }).click();
      await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
      await page.screenshot({
        path: path.resolve("artifacts/visual-proof", `today-dark-${testInfo.project.name}.png`),
        animations: "disabled",
      });
    }
  });
}

test("core visual-proof controls expose their state", async ({ page }) => {
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  const taskToggle = page.getByRole("button", { name: "Complete Record the two-minute demo" });
  await taskToggle.click();
  await expect(
    page.getByRole("button", { name: "Mark Record the two-minute demo incomplete" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.goto("/calendar");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByRole("region", { name: "Week time grid" })).toBeVisible();

  await page.goto("/plan");
  await page.waitForLoadState("networkidle");
  await page.getByRole("checkbox", { name: /record the two-minute demo/i }).click();
  await expect(page.getByRole("button", { name: "Apply 2 changes" })).toBeVisible();

  await page.goto("/tasks/demo");
  await page.waitForLoadState("networkidle");
  await page.getByRole("checkbox", { name: "Record the core workflow" }).check();
  await expect(page.getByRole("checkbox", { name: "Record the core workflow" })).toBeChecked();
});
