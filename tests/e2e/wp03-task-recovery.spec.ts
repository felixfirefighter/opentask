import { expect, test } from "@playwright/test";

import { enterWorkspaceThroughUi } from "./support/wp01-auth";
import {
  closeTaskDetails,
  createRegularList,
  openTaskFromRow,
  quickAddTask,
  selectCommandOptionWithKeyboard,
  taskProblem,
  taskRow,
  updateTask,
  waitForTaskSearch,
} from "./support/wp03-tasks";

test("conflict recovery preserves a title draft and a rejected completion rolls back", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop fault-injection path is sufficient.");

  await enterWorkspaceThroughUi(page, testInfo);
  const task = await quickAddTask(page, "Preserve authoritative state");
  await openTaskFromRow(page, task);
  const authoritative = await updateTask(page, task, { title: "Authoritative concurrent title" });

  const conflictedDraft = "Preserve this local title draft";
  const titleInput = page.getByLabel("Task title", { exact: true });
  await titleInput.fill(conflictedDraft);
  await titleInput.press("Tab");
  await expect(page.getByRole("alert").filter({ hasText: "This title changed elsewhere." })).toBeVisible();
  await expect(titleInput).toHaveValue(conflictedDraft);

  await page.getByRole("button", { name: "Use latest", exact: true }).click();
  await expect(titleInput).toHaveValue(authoritative.title);
  await closeTaskDetails(page, task.id);

  const statusRoute = `**/api/v1/tasks/${task.id}/status`;
  const failedResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/tasks/${task.id}/status`),
  );
  await page.route(statusRoute, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/problem+json",
      body: JSON.stringify(taskProblem("INTERNAL")),
    });
  });
  await taskRow(page, task.id)
    .getByRole("button", { name: `Complete ${authoritative.title}` })
    .click();
  await failedResponse;
  await page.unroute(statusRoute);

  await expect(taskRow(page, task.id)).toBeVisible();
  await expect(
    taskRow(page, task.id).getByRole("button", { name: `Complete ${authoritative.title}` }),
  ).toBeVisible();
  await expect(page.getByText("The previous state has been restored.", { exact: true })).toBeVisible();
});

test("cancel, terminal restore, search, and palette creation work with keyboard controls", async ({
  page,
}, testInfo) => {
  test.setTimeout(75_000);
  test.skip(
    !["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name),
    "Terminal and palette recovery run at desktop and mobile.",
  );

  await enterWorkspaceThroughUi(page, testInfo);
  const task = await quickAddTask(page, "Find terminal keyboard task");

  const more = taskRow(page, task.id).getByRole("button", { name: `More actions for ${task.title}` });
  await more.focus();
  await more.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Complete task" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const cancelItem = page.getByRole("menuitem", { name: "Cancel task" });
  await expect(cancelItem).toBeFocused();
  await cancelItem.press("Enter");
  await expect(page.getByText("Task cancelled", { exact: true })).toBeVisible();
  await expect(taskRow(page, task.id)).toBeHidden();

  await page.goto("/completed");
  const terminalRow = taskRow(page, task.id);
  await expect(terminalRow).toHaveAttribute("data-status", "cancelled");
  const restore = terminalRow.getByRole("button", { name: `Restore ${task.title}` });
  const restoreResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(`/tasks/${task.id}/status`) &&
      response.request().method() === "POST",
  );
  await restore.focus();
  await restore.press("Enter");
  expect((await restoreResponse).status()).toBe(200);
  await expect(terminalRow).toBeHidden();

  await page.goto("/inbox");
  await expect(taskRow(page, task.id)).toBeVisible();

  await page.keyboard.press("Control+K");
  const paletteInput = page.getByPlaceholder("Search tasks or type a task title…");
  await expect(paletteInput).toBeFocused();
  const taskSearchResponse = waitForTaskSearch(page, task.title);
  await paletteInput.fill(task.title);
  expect((await taskSearchResponse).status()).toBe(200);
  const taskOption = page.getByRole("option", {
    name: `${task.title}. Task · Inbox · Matched title`,
    exact: true,
  });
  await selectCommandOptionWithKeyboard(page, taskOption);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}$`, "u"));
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(task.title);

  await page.goto("/inbox");
  const paletteTrigger = page.getByRole("button", {
    name: "Search tasks and commands (Command or Control K)",
  });
  await paletteTrigger.focus();
  await page.keyboard.press("Control+K");
  await expect(paletteInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(paletteTrigger).toBeFocused();

  const paletteTitle = "Capture from keyboard palette";
  await page.keyboard.press("Control+K");
  const createSearchResponse = waitForTaskSearch(page, paletteTitle);
  await paletteInput.fill(paletteTitle);
  expect((await createSearchResponse).status()).toBe(200);
  const createOption = page.getByRole("option", {
    name: `Add “${paletteTitle}”. Create task · Inbox`,
    exact: true,
  });
  await selectCommandOptionWithKeyboard(page, createOption);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Task added to Inbox.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-ui="task-row"]').filter({ hasText: paletteTitle })).toBeVisible();

  await page.keyboard.press("Control+K");
  const completedOption = page.getByRole("option", {
    name: "Completed / cancelled. Destination",
    exact: true,
  });
  await selectCommandOptionWithKeyboard(page, completedOption);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/completed$/u);
});

test("keyboard and touch-menu reorder remain available while offline writes are blocked", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(75_000);
  test.skip(
    !["desktop-chromium", "touch-tablet-chromium"].includes(testInfo.project.name),
    "Desktop keyboard and coarse-pointer menu paths cover reorder parity.",
  );

  await enterWorkspaceThroughUi(page, testInfo);
  const destination = await createRegularList(page, "Keyboard destination");
  await page.reload();
  const alpha = await quickAddTask(page, "Alpha keyboard task");
  const beta = await quickAddTask(page, "Beta keyboard task");

  const touchPath = testInfo.project.name === "touch-tablet-chromium";
  if (touchPath) {
    await taskRow(page, alpha.id)
      .getByRole("button", { name: `More actions for ${alpha.title}` })
      .tap();
    await page.getByRole("menuitem", { name: "Move earlier" }).tap();
  } else {
    const alphaHandle = taskRow(page, alpha.id).getByRole("button", { name: `Reorder ${alpha.title}` });
    await alphaHandle.focus();
    await alphaHandle.press("Space");
    await alphaHandle.press("ArrowUp");
    await expect(
      page.getByRole("status").filter({ hasText: `${alpha.title} moved to position 1 of 2.` }),
    ).toBeVisible();
    await alphaHandle.press("Space");
  }
  await expect(
    page.getByRole("status").filter({ hasText: `${alpha.title} moved to position 1.` }),
  ).toBeVisible();
  await expect(page.locator('[data-ui="task-row"]').first()).toHaveAttribute("data-task-id", alpha.id);

  const alphaMore = taskRow(page, alpha.id).getByRole("button", {
    name: `More actions for ${alpha.title}`,
  });
  if (touchPath) {
    await alphaMore.tap();
    await page.getByRole("menuitem", { name: "Move later" }).tap();
  } else {
    await alphaMore.focus();
    await alphaMore.press("Enter");
    await page.getByRole("menuitem", { name: "Move later" }).press("Enter");
  }
  await expect(
    page.getByRole("status").filter({ hasText: `${alpha.title} moved to position 2.` }),
  ).toBeVisible();
  await expect(page.locator('[data-ui="task-row"]').first()).toHaveAttribute("data-task-id", beta.id);

  if (touchPath) {
    await alphaMore.tap();
    await page.getByRole("menuitem", { name: "Move to…" }).tap();
  } else {
    await alphaMore.focus();
    await alphaMore.press("Enter");
    await page.getByRole("menuitem", { name: "Move to…" }).press("Enter");
  }
  const moveDialog = page.getByRole("dialog", { name: "Move task" });
  await moveDialog.getByLabel("List", { exact: true }).selectOption({ label: destination.name });
  if (touchPath) await moveDialog.getByRole("button", { name: "Move task", exact: true }).tap();
  else {
    await moveDialog.getByRole("button", { name: "Move task", exact: true }).focus();
    await page.keyboard.press("Enter");
  }
  await expect(moveDialog).toBeHidden();
  await expect(taskRow(page, alpha.id)).toBeHidden();

  await page.goto(`/lists/${destination.id}`);
  const movedRow = taskRow(page, alpha.id);
  await expect(movedRow).toBeVisible();
  const movedReorder = movedRow.getByRole("button", { name: `Reorder ${alpha.title}` });
  await expect(movedReorder).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expect(page.getByLabel("New task", { exact: true })).toBeDisabled();
  await expect(movedRow.getByRole("button", { name: `Complete ${alpha.title}` })).toBeDisabled();
  await expect(movedReorder).toBeDisabled();

  const offlineMore = movedRow.getByRole("button", { name: `More actions for ${alpha.title}` });
  if (touchPath) await offlineMore.tap();
  else await offlineMore.click();
  await expect(page.getByRole("menuitem", { name: "Complete task" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("menuitem", { name: "Move to…" })).toHaveAttribute("aria-disabled", "true");
  await context.setOffline(false);
});
