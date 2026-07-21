import { expect, test } from "@playwright/test";

import { enterWorkspaceThroughUi, openVisibleProfileMenu, postDemoFromPage } from "./support/wp01-auth";

test("direct launch runs the guided local onboarding flow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByRole("region", { name: "OpenTask onboarding" })).toBeVisible();
  const nameInput = page.getByLabel("Your name", { exact: true });
  await expect(nameInput).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Create account|Sign in|Sign out/u)).toHaveCount(0);

  await nameInput.fill("Ekko");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "building discipline" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Let's start" }).click();
  await expect(page).toHaveURL("/today", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem("opentask.profile.username"))).resolves.toBe("Ekko");
});

test("protected routes resume through direct launch without credential routes", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("region", { name: "OpenTask onboarding" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).searchParams.get("resume")).toBe("/settings");

  expect(await postDemoFromPage(page)).toBe(200);
  await page.goto("/settings");
  await expect(page).toHaveURL("/settings", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("profile menu has settings but no account sign-out action", async ({ page }, testInfo) => {
  await enterWorkspaceThroughUi(page, testInfo);

  const { menu } = await openVisibleProfileMenu(page);
  await expect(menu).toContainText(/Saved on this device/u);
  await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Sign out|Sign in|Create account/u })).toHaveCount(0);
});
