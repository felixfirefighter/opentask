import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signUpThroughUi } from "./support/wp01-auth";

const routes = ["/", "/sign-in", "/sign-up", "/today", "/calendar", "/tasks/demo", "/plan"];

for (const route of routes) {
  test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const severeViolations = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(severeViolations).toEqual([]);
  });
}

test("authenticated Inbox and settings have no serious or critical automated accessibility violations", async ({
  page,
}, testInfo) => {
  await signUpThroughUi(page, testInfo);

  for (const route of ["/inbox", "/settings"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const severeViolations = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(severeViolations).toEqual([]);
  }
});
