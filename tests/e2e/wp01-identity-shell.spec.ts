import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { openVisibleAccountMenu, signUpThroughUi } from "./support/wp01-auth";

const protectedRoutes = ["/inbox", "/settings"] as const;

test("auth forms preserve the approved responsive contract", async ({ context, page }, testInfo) => {
  const evidenceDirectory = path.resolve("artifacts/visual-proof/wp01");
  await mkdir(evidenceDirectory, { recursive: true });

  for (const authRoute of ["sign-in", "sign-up"] as const) {
    await page.goto(`/${authRoute}`);
    await expect(
      page.getByRole("heading", { name: authRoute === "sign-in" ? "Welcome back" : "Create your account" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
    await page.screenshot({
      path: path.join(evidenceDirectory, `auth-${authRoute}-${testInfo.project.name}.png`),
      animations: "disabled",
    });
  }

  if (["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
      path: path.join(evidenceDirectory, `auth-sign-in-dark-${testInfo.project.name}.png`),
      animations: "disabled",
    });
  }

  if (testInfo.project.name === "desktop-chromium") {
    await context.setOffline(true);
    await expect(page.getByText("You’re offline. Connect to the internet to sign in.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await context.setOffline(false);
  }
});

test("protected workspace routes require an authoritative session and preserve return intent", async ({
  context,
  page,
}) => {
  for (const protectedRoute of protectedRoutes) {
    await context.clearCookies();
    await page.goto(protectedRoute);

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const redirected = new URL(page.url());
    expect(redirected.pathname).toBe("/sign-in");
    expect(redirected.searchParams.get("returnTo")).toBe(protectedRoute);
  }
});

test("a fresh Better Auth account enters its own usable Inbox", async ({ page }, testInfo) => {
  const account = await signUpThroughUi(page, testInfo);

  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inbox is empty" })).toBeVisible();

  const preferences = await page.context().request.get("/api/v1/preferences");
  expect(preferences.status()).toBe(200);
  await expect(preferences.json()).resolves.toMatchObject({
    schemaVersion: 1,
    version: 1,
  });

  const crossOriginMutation = await page.context().request.patch("/api/v1/preferences", {
    data: { expectedVersion: 1, patch: { theme: "dark" } },
    headers: { origin: "https://attacker.example" },
  });
  expect(crossOriginMutation.status()).toBe(403);
  const oversizedMutation = await page.context().request.patch("/api/v1/preferences", {
    data: { expectedVersion: 1, patch: { theme: "dark" }, padding: "x".repeat(2200) },
    headers: { origin: "http://127.0.0.1:3107" },
  });
  expect(oversizedMutation.status()).toBe(400);
  const unchangedPreferences = await page.context().request.get("/api/v1/preferences");
  await expect(unchangedPreferences.json()).resolves.toMatchObject({ theme: "system", version: 1 });

  const { menu, trigger } = await openVisibleAccountMenu(page);
  await expect(menu).toContainText(account.email);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.goto("/sign-up");
  await expect(page).toHaveURL("/inbox");
});

test("settings protection carries a safe return through real account creation", async ({
  page,
}, testInfo) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in\?/u);

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up\?/u);
  const signUpUrl = new URL(page.url());
  expect(signUpUrl.pathname).toBe("/sign-up");
  expect(signUpUrl.searchParams.get("returnTo")).toBe("/settings");

  const account = await signUpThroughUi(page, testInfo, { returnTo: "/settings" });
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Date and time" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();

  const evidenceDirectory = path.resolve("artifacts/visual-proof/wp01");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDirectory, `settings-${testInfo.project.name}.png`),
    animations: "disabled",
  });

  const { menu } = await openVisibleAccountMenu(page);
  await expect(menu).toContainText(account.email);
});

test("sign out invalidates access before real sign-in restores the session", async ({ page }, testInfo) => {
  const account = await signUpThroughUi(page, testInfo);

  const authorized = await page.context().request.get("/api/v1/preferences");
  expect(authorized.status()).toBe(200);

  const { menu } = await openVisibleAccountMenu(page);
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");

  const denied = await page.context().request.get("/api/v1/preferences");
  expect(denied.status()).toBe(401);

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const redirected = new URL(page.url());
  expect(redirected.pathname).toBe("/sign-in");
  expect(redirected.searchParams.get("returnTo")).toBe("/inbox");

  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();

  const reauthorized = await page.context().request.get("/api/v1/preferences");
  expect(reauthorized.status()).toBe(200);
});

test("landing demo creates and then resets the same isolated demo actor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop UI smoke covers demo entry.");

  const clientSeed = crypto.randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${clientSeed.slice(0, 4)}:${clientSeed.slice(4, 8)}:${clientSeed.slice(8, 12)}:${clientSeed.slice(12, 16)}::1`;
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto("/");
  await expect(
    page.getByText("Creates or resets an isolated demo workspace for this visitor."),
  ).toBeVisible();

  const createdResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  const createdResponse = await createdResponsePromise;
  expect(createdResponse.status()).toBe(200);
  expect(createdResponse.headers()["content-type"]).toContain("application/json");
  await expect(page).toHaveURL("/inbox");

  const sessionBefore = await page.context().request.get("/api/auth/get-session");
  expect(sessionBefore.status()).toBe(200);
  const actorBefore = await readSessionActor(sessionBefore.json());

  const resetResponse = await page.context().request.post("/api/v1/demo", {
    data: {},
    headers: {
      origin: "http://127.0.0.1:3107",
      "x-real-ip": clientAddress,
    },
  });
  expect(resetResponse.status()).toBe(200);
  await expect(resetResponse.json()).resolves.toEqual({ mode: "reset", redirectTo: "/inbox" });
  expect(resetResponse.headers()["set-cookie"]).toBeUndefined();

  const sessionAfter = await page.context().request.get("/api/auth/get-session");
  expect(sessionAfter.status()).toBe(200);
  const actorAfter = await readSessionActor(sessionAfter.json());
  expect(actorAfter).toEqual(actorBefore);
});

test("authenticated shell keyboard order and responsive frame remain usable", async ({ page }, testInfo) => {
  await signUpThroughUi(page, testInfo);
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect([390, 1024, 1440]).toContain(viewport!.width);

  const layout = await page.evaluate(() => {
    const main = document.querySelector("main");
    const mobileNavigation = document.querySelector('nav[aria-label="Mobile navigation"]');
    const overflowingControls = Array.from(
      document.querySelectorAll<HTMLElement>("a, button, input, select, textarea"),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      })
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      })
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName);

    return {
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      mainBeforeMobileNavigation:
        main !== null &&
        mobileNavigation !== null &&
        Boolean(main.compareDocumentPosition(mobileNavigation) & Node.DOCUMENT_POSITION_FOLLOWING),
      overflowingControls,
    };
  });

  expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.overflowingControls).toEqual([]);
  expect(layout.mainBeforeMobileNavigation).toBe(true);

  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  const sidebar = page.getByRole("complementary", { name: "Inbox navigation" });
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  if (viewport!.width >= 1024) {
    await expect(rail).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(mobileNavigation).toBeHidden();
  } else {
    await expect(rail).toBeHidden();
    await expect(sidebar).toBeHidden();
    await expect(mobileNavigation).toBeVisible();
  }

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  const accountTrigger = page
    .getByRole("button", { name: /Open account actions for/u })
    .filter({ visible: true });
  await accountTrigger.focus();
  await accountTrigger.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Account actions" });
  await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(accountTrigger).toBeFocused();

  const evidenceDirectory = path.resolve("artifacts/visual-proof/wp01");
  await mkdir(evidenceDirectory, { recursive: true });
  await accountTrigger.evaluate((element) => (element as HTMLElement).blur());
  await page.screenshot({
    path: path.join(evidenceDirectory, `authenticated-inbox-${testInfo.project.name}.png`),
    animations: "disabled",
  });
});

async function readSessionActor(sessionBody: Promise<unknown>) {
  const body = await sessionBody;
  expect(body).toMatchObject({ user: { id: expect.any(String), email: expect.any(String) } });
  const session = body as { user: { id: string; email: string } };
  return { id: session.user.id, email: session.user.email };
}
