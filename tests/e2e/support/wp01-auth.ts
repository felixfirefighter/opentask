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
    password: `Omplish-${randomUUID()}`,
  };
}

export async function enterWorkspaceThroughUi(
  page: Page,
  testInfo: TestInfo,
  options: Readonly<{ returnTo?: "/inbox" | "/settings" }> = {},
) {
  const account = createUniqueTestAccount(testInfo);
  const clientSeed = randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${clientSeed.slice(0, 4)}:${clientSeed.slice(4, 8)}:${clientSeed.slice(8, 12)}:${clientSeed.slice(12, 16)}::1`;
  const returnTo = options.returnTo;
  const destination = returnTo ?? "/inbox";

  // Exercise the real database limiter while keeping parallel browser projects in separate client buckets.
  // The dedicated identity-shell spec covers the scripted onboarding UI; the other golden paths need
  // a fast authenticated fixture and should not duplicate that conversation on every route test.
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto(`/?resume=${encodeURIComponent(destination)}`);
  const demoStatus = await postDemoFromPage(page);
  expect(demoStatus).toBe(200);
  await page.goto(destination);

  await expect(page).toHaveURL(destination, { timeout: 30_000 });
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
  const exportResponse = await page.context().request.get("/api/v1/export");
  expect(exportResponse.status()).toBe(200);
  const exportEnvelope = (await exportResponse.json()) as { identity?: { profile?: { email?: string } } };
  return { ...account, email: exportEnvelope.identity?.profile?.email ?? account.email };
}

export async function postDemoFromPage(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return response.status;
  });
}

export async function openVisibleProfileMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /Open profile actions for/u }).filter({ visible: true });
  await expect(trigger).toHaveCount(1);
  await trigger.click();

  const menu = page.getByRole("menu", { name: "Profile actions" });
  await expect(menu).toBeVisible();
  return { menu, trigger };
}
