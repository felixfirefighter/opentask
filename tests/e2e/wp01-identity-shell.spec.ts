import { expect, test } from "@playwright/test";

import { enterWorkspaceThroughUi, openVisibleProfileMenu } from "./support/wp01-auth";

test("direct launch asks once for a local profile username", async ({ page }) => {
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Set up your profile" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/not an account or sign-in/u)).toBeVisible();
  await expect(page.getByText(/Create account|Sign in|Sign out/u)).toHaveCount(0);

  await dialog.getByLabel("Profile username", { exact: true }).fill("Ekko");
  await dialog.getByRole("button", { name: "Open workspace" }).click();
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/Inbox · OpenTask/u);
  await expect(page.evaluate(() => localStorage.getItem("opentask.profile.username"))).resolves.toBe("Ekko");
});

test("protected routes resume through direct launch without credential routes", async ({ page }) => {
  await page.goto("/settings");

  const dialog = page.getByRole("dialog", { name: "Set up your profile" });
  await expect(dialog).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).searchParams.get("resume")).toBe("/settings");

  await dialog.getByLabel("Profile username", { exact: true }).fill("Settings user");
  await dialog.getByRole("button", { name: "Open workspace" }).click();
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
