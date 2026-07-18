import { expect, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";

export type TestAccount = Readonly<{
  email: string;
  password: string;
}>;

export function createUniqueTestAccount(testInfo: TestInfo): TestAccount {
  const project = testInfo.project.name.replace(/[^a-z0-9]+/giu, "-").toLowerCase();

  return {
    email: `wp01-${project}-${randomUUID()}@example.test`,
    password: `OpenTask-${randomUUID()}`,
  };
}

export async function signUpThroughUi(
  page: Page,
  testInfo: TestInfo,
  options: Readonly<{ returnTo?: "/inbox" | "/settings" }> = {},
) {
  const account = createUniqueTestAccount(testInfo);
  const clientSeed = randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${clientSeed.slice(0, 4)}:${clientSeed.slice(4, 8)}:${clientSeed.slice(8, 12)}:${clientSeed.slice(12, 16)}::1`;
  const returnTo = options.returnTo;
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";

  // Exercise the real database limiter while keeping parallel browser projects in separate client buckets.
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto(`/sign-up${query}`);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Confirm password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(returnTo ?? "/inbox");
  return account;
}

export async function openVisibleAccountMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /Open account actions for/u }).filter({ visible: true });
  await expect(trigger).toHaveCount(1);
  await trigger.click();

  const menu = page.getByRole("menu", { name: "Account actions" });
  await expect(menu).toBeVisible();
  return { menu, trigger };
}
