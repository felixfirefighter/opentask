import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  plannerApplyResultSchema,
  plannerProposalDtoSchema,
} from "../../modules/assistant/application/contracts";
import { persistG3Proposal, readG3DatabaseState } from "./support/g3-database-fixture";
import {
  calendarEvent,
  configureTestTimeZone,
  localDateIn,
  planningTaskRow,
} from "./support/golden-path-planning";
import { createG3Proposal, g3ActionIds, installPlannerRouteFixtures } from "./support/g3-planner-fixtures";
import { enterWorkspaceThroughUi } from "./support/wp01-auth";
import { quickAddTask } from "./support/wp03-tasks";

const APP_ORIGIN = "http://127.0.0.1:3107";
const responsiveProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const plannerFixtureMode = process.env.PLAYWRIGHT_PLANNER_FIXTURE === "1";

test("G3 explicitly applies one real atomic and idempotent plan across task projections", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!responsiveProjects.has(testInfo.project.name), "The G3 golden path runs at desktop and mobile.");
  test.skip(!plannerFixtureMode, "Review/apply runs only with the intercepted planner fixture server.");

  await enterIsolatedDemo(page, testInfo.project.name);
  await configureTestTimeZone(page);
  const selectedTask = await quickAddTask(page, "G3 verify the release walkthrough");
  const proposal = createG3Proposal(selectedTask, localDateIn("Asia/Singapore"));
  const scheduledAction = proposal.proposal.actions.find(({ actionId }) => actionId === g3ActionIds.schedule);
  const createdAction = proposal.proposal.actions.find(({ actionId }) => actionId === g3ActionIds.create);
  if (scheduledAction?.kind !== "schedule" || createdAction?.kind !== "create") {
    throw new Error("G3 fixture is missing its required task actions.");
  }
  const scheduledActionAfter = scheduledAction.after;
  if (scheduledActionAfter.kind !== "timed") {
    throw new Error("G3 fixture schedule action must use a timed schedule.");
  }
  const createdActionSchedule = createdAction.after.schedule;
  if (createdActionSchedule?.kind !== "timed") {
    throw new Error("G3 fixture create action must have a timed schedule.");
  }
  const databaseKey = {
    proposalId: proposal.id,
    selectedTaskId: selectedTask.id,
    createdTaskId: g3ActionIds.create,
  };
  await persistG3Proposal(page, proposal);
  const harness = await installPlannerRouteFixtures(page, proposal);

  expect(await readG3DatabaseState(page, databaseKey)).toEqual({
    proposal: { status: "pending", appliedAt: null },
    selectedTask: {
      id: selectedTask.id,
      title: selectedTask.title,
      descriptionMd: "",
      priority: "none",
      version: 1,
    },
    selectedSchedule: null,
    createdTask: null,
    createdSchedule: null,
  });

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

  const loadedPending = await readPlannerProposal(page, proposal.id);
  expect(loadedPending).toMatchObject({ id: proposal.id, status: "pending" });

  await expect(page.getByText("Why this change:").first()).toBeVisible();
  await expect(page.getByText("Confirm the final reviewer before publishing.")).toBeVisible();
  await expect(page.getByText("No free interval was available inside the work window.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Review every proposed change" })).toBeVisible();
  await expect(page.getByText(proposal.proposal.summary)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduled and updated" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New tasks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deferred and overflow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply 4 changes" })).toBeEnabled();
  const reviewEvidence = await captureReviewEvidence(page, testInfo.project.name);

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

  expect(await readG3DatabaseState(page, databaseKey)).toEqual({
    proposal: { status: "pending", appliedAt: null },
    selectedTask: {
      id: selectedTask.id,
      title: selectedTask.title,
      descriptionMd: "",
      priority: "none",
      version: 1,
    },
    selectedSchedule: null,
    createdTask: null,
    createdSchedule: null,
  });

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

  const afterApply = await readG3DatabaseState(page, databaseKey);
  expect(afterApply).toMatchObject({
    proposal: { status: "applied", appliedAt: expect.any(String) },
    selectedTask: {
      id: selectedTask.id,
      title: editedTitle,
      descriptionMd: "Add the verified demo outcome.",
      priority: "none",
      version: 2,
    },
    selectedSchedule: {
      taskId: selectedTask.id,
      kind: "timed",
      startAt: scheduledActionAfter.startAt,
      endAt: scheduledActionAfter.endAt,
      timezone: "Asia/Singapore",
    },
    createdTask: {
      id: g3ActionIds.create,
      title: "Draft release summary",
      descriptionMd: "Capture the deadline-safe core and known limitations.",
      priority: "medium",
      version: 1,
    },
    createdSchedule: {
      taskId: g3ActionIds.create,
      kind: "timed",
      startAt: createdActionSchedule.startAt,
      endAt: createdActionSchedule.endAt,
      timezone: "Asia/Singapore",
    },
  });

  const loadedApplied = await readPlannerProposal(page, proposal.id);
  expect(loadedApplied).toMatchObject({ id: proposal.id, status: "applied", appliedAt: expect.any(String) });
  const duplicate = await context.request.post(`/api/v1/planner/proposals/${proposal.id}/apply`, {
    data: harness.applySelections[0],
    headers: { origin: APP_ORIGIN, "idempotency-key": proposal.applyToken },
  });
  expect(duplicate.status()).toBe(200);
  expect(plannerApplyResultSchema.parse(await duplicate.json())).toEqual({
    proposalId: proposal.id,
    outcome: "already_applied",
    appliedActionCount: 0,
  });
  expect(await readG3DatabaseState(page, databaseKey)).toEqual(afterApply);

  await page.getByRole("link", { name: "Open Today" }).click();
  await expect(page).toHaveURL(/\/today$/u);
  await expect(planningTaskRow(page, editedTitle)).toBeVisible();
  await expect(planningTaskRow(page, "Draft release summary")).toBeVisible();

  await page.goto(`/calendar?date=${proposal.planningDate}&view=agenda`);
  await expect(calendarEvent(page, editedTitle)).toBeVisible();
  await expect(calendarEvent(page, "Draft release summary")).toBeVisible();
  await publishReviewEvidence(reviewEvidence);
});

test("G3 recovers from provider failure and rejects the persisted proposal without task writes", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop fault-injection path is sufficient.");
  test.skip(!plannerFixtureMode, "Provider recovery runs only with the intercepted planner fixture server.");

  await enterWorkspaceThroughUi(page, testInfo);
  await configureTestTimeZone(page);
  const selectedTask = await quickAddTask(page, "G3 recover the proposal decision");
  const proposal = createG3Proposal(selectedTask, localDateIn("Asia/Singapore"));
  const databaseKey = {
    proposalId: proposal.id,
    selectedTaskId: selectedTask.id,
    createdTaskId: g3ActionIds.create,
  };
  await persistG3Proposal(page, proposal);
  const harness = await installPlannerRouteFixtures(page, proposal, {
    failFirstCreate: true,
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
  await expect(page.getByRole("heading", { name: "This proposal was rejected" })).toBeFocused();
  expect(harness.rejectCount()).toBe(1);
  expect(harness.applySelections).toHaveLength(0);
  expect(harness.unexpectedRequests).toEqual([]);
  expect(await readPlannerProposal(page, proposal.id)).toMatchObject({ status: "rejected" });
  expect(await readG3DatabaseState(page, databaseKey)).toMatchObject({
    proposal: { status: "rejected", appliedAt: null },
    selectedTask: { id: selectedTask.id, title: selectedTask.title, version: 1 },
    selectedSchedule: null,
    createdTask: null,
    createdSchedule: null,
  });
});

test("G3 no-key state keeps manual planning routes available", async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  test.skip(
    !responsiveProjects.has(testInfo.project.name),
    "The no-key contract runs at desktop and mobile.",
  );
  test.skip(plannerFixtureMode, "The no-key contract runs only against the canonical no-key server.");

  await enterWorkspaceThroughUi(page, testInfo);
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

async function enterIsolatedDemo(page: Page, projectName: string) {
  const seed = randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto("/");
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/demo") && response.request().method() === "POST",
  );
  await page.getByLabel("Profile username", { exact: true }).fill("Planner user");
  await page.getByRole("button", { name: "Open workspace" }).click();
  expect((await responsePromise).status(), `${projectName} demo entry`).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  const dismissTips = page.getByRole("button", { name: "Dismiss getting started tips" });
  if (await dismissTips.isVisible()) await dismissTips.click();
}

async function readPlannerProposal(page: Page, proposalId: string) {
  const response = await page.context().request.get(`/api/v1/planner/proposals/${proposalId}`);
  expect(response.status()).toBe(200);
  return plannerProposalDtoSchema.parse(await response.json());
}

async function captureReviewEvidence(page: Page, projectName: string) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "opentask-g3-review-"));
  const fileName = `ai-review-${projectName}.png`;
  const screenshotPath = path.join(temporaryDirectory, fileName);
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.getByRole("heading", { name: "AI Review", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: screenshotPath,
    animations: "disabled",
    fullPage: true,
  });
  const captures = [{ fileName, screenshotPath }];

  if (projectName === "mobile-chromium") {
    const proposalCard = page.locator("article").first();
    const proposalTitle = proposalCard.getByRole("heading");
    const beforeValue = proposalCard.getByText("Before", { exact: true });
    const applyButton = page.getByRole("button", { name: /Apply \d+ changes?/u });
    await proposalCard.scrollIntoViewIfNeeded();
    await expect(proposalCard).toBeInViewport();
    await expect(proposalTitle).toBeInViewport();
    await expect(beforeValue).toBeInViewport();
    await expect(applyButton).toBeInViewport();

    const [titleBox, beforeBox, applyBox] = await Promise.all([
      proposalTitle.boundingBox(),
      beforeValue.boundingBox(),
      applyButton.boundingBox(),
    ]);
    expect(titleBox, "populated proposal title bounds").not.toBeNull();
    expect(beforeBox, "populated proposal diff bounds").not.toBeNull();
    expect(applyBox, "sticky Apply bounds").not.toBeNull();
    expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(applyBox!.y);
    expect(beforeBox!.y + beforeBox!.height).toBeLessThanOrEqual(applyBox!.y);

    const populatedFileName = "ai-review-populated-mobile-chromium.png";
    const populatedScreenshotPath = path.join(temporaryDirectory, populatedFileName);
    await page.screenshot({
      path: populatedScreenshotPath,
      animations: "disabled",
      fullPage: true,
    });
    captures.push({ fileName: populatedFileName, screenshotPath: populatedScreenshotPath });
  }

  return { captures, temporaryDirectory };
}

async function publishReviewEvidence(
  capture: Awaited<ReturnType<typeof captureReviewEvidence>>,
): Promise<void> {
  const evidenceDirectory = path.resolve("artifacts/visual-proof/g3");
  await mkdir(evidenceDirectory, { recursive: true });
  await Promise.all(
    capture.captures.map(({ fileName, screenshotPath }) =>
      copyFile(screenshotPath, path.join(evidenceDirectory, fileName)),
    ),
  );
  await rm(capture.temporaryDirectory, { recursive: true, force: true });
}
