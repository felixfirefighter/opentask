import { expect, test } from "@playwright/test";

import { enterWorkspaceThroughUi } from "./support/wp01-auth";
import {
  closeTaskDetails,
  createRegularList,
  createSection,
  createTask,
  openTaskFromRow,
  quickAddTask,
  taskRow,
} from "./support/wp03-tasks";

const goldenPathProjects = new Set(["desktop-chromium", "mobile-chromium"]);

test("unscheduled quick add can be inspected, enriched, organized, completed, and undone", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!goldenPathProjects.has(testInfo.project.name), "The G1 core loop runs at desktop and mobile.");

  await enterWorkspaceThroughUi(page, testInfo);
  const list = await createRegularList(page, "Launch work");
  const section = await createSection(page, list.id, "Demo prep");
  await page.reload();

  const task = await quickAddTask(page, "Prepare release walkthrough");
  await openTaskFromRow(page, task);

  const editedTitle = "Prepare concise release walkthrough";
  const titleInput = page.getByLabel("Task title", { exact: true });
  await titleInput.fill(editedTitle);
  await titleInput.press("Tab");
  await expect(page.getByText("Title saved", { exact: true })).toBeVisible();

  const priority = page.getByRole("combobox", { name: "Priority", exact: true });
  await priority.focus();
  await priority.press("h");
  await expect(page.getByText("Priority saved", { exact: true })).toBeVisible();
  await expect(priority).toHaveValue("high");

  await page.getByRole("button", { name: /Tags/u }).click();
  const tagsDialog = page.getByRole("dialog", { name: "Tags" });
  await tagsDialog.getByLabel("New tag", { exact: true }).fill("Launch");
  await tagsDialog.getByLabel("New tag color").selectOption("sky");
  await tagsDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(tagsDialog.getByRole("checkbox", { name: "Launch" })).toBeChecked();
  await tagsDialog.getByRole("button", { name: "Save tags" }).click();
  await expect(tagsDialog).toBeHidden();

  await page.getByLabel("Add checklist item", { exact: true }).fill("Verify keyboard path");
  await page.getByLabel("Add checklist item", { exact: true }).press("Enter");
  await expect(page.getByRole("checkbox", { name: "Verify keyboard path" })).toBeVisible();
  await page.getByLabel("Add checklist item", { exact: true }).fill("Record verification result");
  await page.getByLabel("Add checklist item", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Open actions for Verify keyboard path" }).click();
  await page.getByRole("menuitem", { name: "Move Verify keyboard path later" }).click();
  const checklist = page.getByRole("region", { name: "Steps" }).locator('input[type="checkbox"]');
  await expect(checklist.nth(0)).toHaveAccessibleName("Record verification result");
  await expect(checklist.nth(1)).toHaveAccessibleName("Verify keyboard path");

  await page.getByLabel("Add subtask", { exact: true }).fill("Capture final screenshot");
  await page.getByLabel("Add subtask", { exact: true }).press("Enter");
  await expect(page.getByRole("link", { name: "Capture final screenshot" })).toBeVisible();
  await page.getByLabel("Add subtask", { exact: true }).fill("Rehearse keyboard order");
  await page.getByLabel("Add subtask", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Open actions for Capture final screenshot" }).click();
  await page.getByRole("menuitem", { name: "Move Capture final screenshot later" }).click();
  const subtaskLinks = page.getByRole("region", { name: "Steps" }).getByRole("link");
  await expect(subtaskLinks.nth(0)).toHaveAccessibleName("Rehearse keyboard order");
  await expect(subtaskLinks.nth(1)).toHaveAccessibleName("Capture final screenshot");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Markdown description", { exact: true })
    .fill("## Demo notes\n\n- Keep the flow **manual-first**.\n- Stay unscheduled.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(
    page.getByTestId("markdown-preview").getByRole("heading", { name: "Demo notes" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /List and section/u }).click();
  const moveDialog = page.getByRole("dialog", { name: "Move task" });
  await moveDialog.getByLabel("List", { exact: true }).selectOption({ label: list.name });
  await moveDialog.getByLabel("Section", { exact: true }).selectOption({ label: section.name });
  await moveDialog.getByRole("button", { name: "Move task", exact: true }).click();
  await expect(moveDialog).toBeHidden();
  await expect(page.getByRole("button", { name: /List and section/u })).toContainText(
    `${list.name} · ${section.name}`,
  );

  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();

  if (page.viewportSize()!.width >= 768) {
    await page.getByRole("button", { name: "Close task details" }).click();
  } else {
    await page.getByRole("link", { name: "Back to task list" }).click();
  }
  await page.goto(`/lists/${list.id}`);
  const movedRow = taskRow(page, task.id);
  await expect(movedRow).toBeVisible();
  await expect(movedRow.getByRole("link")).toContainText(editedTitle);
  await expect(movedRow.getByRole("img", { name: "high priority" })).toBeVisible();
  await expect(movedRow).toContainText("Launch");
});

test("task details use a desktop inspector and a mobile full-page route", async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  test.skip(
    !goldenPathProjects.has(testInfo.project.name),
    "The responsive detail contract is defined by desktop and mobile endpoints.",
  );

  await enterWorkspaceThroughUi(page, testInfo);
  const task = await quickAddTask(page, "Inspect responsive task details");
  await openTaskFromRow(page, task);
  await expect(page.getByRole("heading", { level: 1, name: task.title })).toBeFocused();

  if (page.viewportSize()!.width >= 768) {
    await expect(page.getByRole("complementary", { name: "Task details" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to task list" })).toHaveCount(0);
  } else {
    await expect(page.getByRole("link", { name: "Back to task list" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}$`, "u"));
  }

  await closeTaskDetails(page, task.id);
});

test("a long title and a bounded large list stay usable with a focused mobile composer", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "mobile-chromium", "The virtual-keyboard layout risk is mobile-only.");

  await enterWorkspaceThroughUi(page, testInfo);
  const longTitle = "Long task title ".repeat(24).trim();
  const longTask = await quickAddTask(page, longTitle);

  for (let index = 1; index <= 51; index += 1) {
    await createTask(page, {
      listId: longTask.listId,
      title: `Bulk task ${String(index).padStart(2, "0")}`,
    });
  }

  await page.goto("/inbox");
  await expect(page.locator('[data-ui="task-row"]')).toHaveCount(50);
  await page.getByRole("button", { name: "Load more tasks" }).click();
  await expect(page.locator('[data-ui="task-row"]')).toHaveCount(52);
  await expect(taskRow(page, longTask.id).getByRole("link")).toContainText(longTitle);

  const input = page.getByLabel("New task", { exact: true });
  await input.focus();
  const focusedComposer = await input.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      active: document.activeElement === element,
      bottom: box.bottom,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(focusedComposer.active).toBe(true);
  expect(focusedComposer.bottom).toBeLessThanOrEqual(focusedComposer.visualHeight);
  expect(focusedComposer.scrollWidth).toBeLessThanOrEqual(focusedComposer.viewportWidth + 1);

  await page.route("**/api/v1/tasks", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const response = await route.fetch();
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ response });
  });
  const throttledTitle = "Keep the draft visible on a slow network";
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/tasks" && response.request().method() === "POST",
  );
  const composer = page.locator("form").filter({ has: input });
  await input.fill(throttledTitle);
  await expect(composer.getByRole("button", { name: "Add task", exact: true })).toBeEnabled();
  await input.press("Enter");
  await expect(composer.getByRole("button", { name: "Adding…", exact: true })).toBeVisible();
  expect((await responsePromise).status()).toBe(201);
  await page.unroute("**/api/v1/tasks");
  await expect(page.locator('[data-ui="task-row"]').filter({ hasText: throttledTitle })).toBeVisible();
});
