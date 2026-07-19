import { expect, test, type Page } from "@playwright/test";

import { configureTestTimeZone, localDateIn } from "./support/golden-path-planning";
import { createG3Proposal, g3ActionIds, installPlannerRouteFixtures } from "./support/g3-planner-fixtures";
import { signUpThroughUi } from "./support/wp01-auth";
import { quickAddTask } from "./support/wp03-tasks";

const responsiveProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const plannerFixtureMode = process.env.PLAYWRIGHT_PLANNER_FIXTURE === "1";

test("G3 reviews an edited selection and sends no apply request before explicit Apply", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!responsiveProjects.has(testInfo.project.name), "The G3 golden path runs at desktop and mobile.");
  test.skip(!plannerFixtureMode, "Review/apply runs only with the intercepted planner fixture server.");

  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page);
  const selectedTask = await quickAddTask(page, "G3 verify the release walkthrough");
  const proposal = createG3Proposal(selectedTask, localDateIn("Asia/Singapore"));
  const harness = await installPlannerRouteFixtures(page, proposal);

  await page.goto("/plan");
  await expectPlannerCapability(page);
  await page
    .getByRole("textbox", { name: /Brain dump/u })
    .fill(
      "Prepare the release summary, schedule the verified walkthrough, and keep unclear friend feedback visible.",
    );
  await page.getByRole("checkbox", { name: new RegExp(selectedTask.title, "u") }).check();
  expect(harness.applySelections).toHaveLength(0);

  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByRole("heading", { name: "Proposal changes" })).toBeFocused();
  expect(harness.createInputs).toHaveLength(1);
  expect(harness.createInputs[0]).toMatchObject({ selectedTaskIds: [selectedTask.id] });
  expect(harness.applySelections).toHaveLength(0);

  await expect(page.getByText("Why this change:").first()).toBeVisible();
  await expect(page.getByText("Confirm the final reviewer before publishing.")).toBeVisible();
  await expect(page.getByText("No free interval was available inside the work window.")).toBeVisible();

  const updateCard = page.getByText("Update", { exact: true }).locator("xpath=ancestor::article");
  await updateCard.getByRole("button", { name: "Edit change" }).click();
  const editedTitle = "G3 reviewed release walkthrough";
  await updateCard.getByRole("textbox", { name: "Title after apply" }).fill(editedTitle);
  await page.getByRole("checkbox", { name: "Select defer action for Clarify friend feedback" }).uncheck();
  const apply = page.getByRole("button", { name: "Apply 3 changes" });
  await expect(apply).toBeEnabled();
  expect(harness.applySelections).toHaveLength(0);

  await context.setOffline(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Planner actions are unavailable offline" }),
  ).toBeVisible();
  await expect(apply).toBeDisabled();
  expect(harness.applySelections).toHaveLength(0);
  await context.setOffline(false);
  await expect(apply).toBeEnabled();

  await apply.click();
  await expect(page.getByRole("heading", { name: "Your selected changes were applied" })).toBeFocused();
  await expect(page.getByText("3 actions were committed together.")).toBeVisible();
  expect(harness.applySelections).toHaveLength(1);
  expect(harness.applyIdempotencyKeys).toEqual([proposal.applyToken]);
  expect(harness.applySelections[0]?.actions).toHaveLength(3);
  expect(harness.applySelections[0]?.actions.some(({ actionId }) => actionId === g3ActionIds.defer)).toBe(
    false,
  );
  expect(
    harness.applySelections[0]?.actions.find(({ actionId }) => actionId === g3ActionIds.update),
  ).toMatchObject({ after: { title: editedTitle } });
  expect(harness.rejectCount()).toBe(0);
  expect(harness.unexpectedRequests).toEqual([]);
});

test("G3 recovers from provider failure and refreshes a rejection whose response was lost", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop fault-injection path is sufficient.");
  test.skip(!plannerFixtureMode, "Provider recovery runs only with the intercepted planner fixture server.");

  await signUpThroughUi(page, testInfo);
  await configureTestTimeZone(page);
  const selectedTask = await quickAddTask(page, "G3 recover the proposal decision");
  const proposal = createG3Proposal(selectedTask, localDateIn("Asia/Singapore"));
  const harness = await installPlannerRouteFixtures(page, proposal, {
    failFirstCreate: true,
    loseRejectResponse: true,
  });

  await page.goto("/plan");
  await expectPlannerCapability(page);
  await page.getByRole("textbox", { name: /Brain dump/u }).fill("Recover this deterministic proposal.");
  await page.getByRole("checkbox", { name: new RegExp(selectedTask.title, "u") }).check();
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Planning is temporarily unavailable" }),
  ).toBeVisible();
  expect(harness.applySelections).toHaveLength(0);
  expect(harness.rejectCount()).toBe(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Proposal changes" })).toBeFocused();
  expect(harness.createInputs).toHaveLength(2);
  await page.getByRole("button", { name: "Reject proposal" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "The rejection could not be confirmed" }),
  ).toBeVisible();
  expect(harness.rejectCount()).toBe(1);
  expect(harness.applySelections).toHaveLength(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "This proposal was rejected" })).toBeFocused();
  expect(harness.getCount()).toBe(1);
  expect(harness.unexpectedRequests).toEqual([]);
});

test("G3 no-key state keeps manual planning routes available", async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  test.skip(
    !responsiveProjects.has(testInfo.project.name),
    "The no-key contract runs at desktop and mobile.",
  );
  test.skip(plannerFixtureMode, "The no-key contract runs only against the canonical no-key server.");

  await signUpThroughUi(page, testInfo);
  await page.goto("/plan");
  const unavailable = page.getByRole("heading", {
    name: "Planning is unavailable because no AI key is configured",
  });
  await expect(unavailable).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Today" })).toHaveAttribute("href", "/today");
  await expect(page.getByRole("link", { name: "Open Calendar" })).toHaveAttribute("href", "/calendar");
  await expect(page.getByRole("button", { name: "Create proposal" })).toHaveCount(0);
});

async function expectPlannerCapability(page: Page) {
  const unavailable = page.getByRole("heading", {
    name: "Planning is unavailable because no AI key is configured",
  });
  await expect(unavailable).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create proposal" })).toBeVisible();
}
