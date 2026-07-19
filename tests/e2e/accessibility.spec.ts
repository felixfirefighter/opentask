import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signUpThroughUi } from "./support/wp01-auth";
import {
  createRegularList,
  createSection,
  createTask,
  moveTask,
  quickAddTask,
  taskRow,
  transitionTask,
} from "./support/wp03-tasks";

const routes = ["/", "/sign-in", "/sign-up", "/today", "/calendar", "/tasks/demo", "/plan"];

for (const route of routes) {
  test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expectNoSevereViolations(page);
  });
}

test("authenticated WP03 task routes and states have no serious or critical violations", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await signUpThroughUi(page, testInfo);
  const inboxTask = await quickAddTask(page, "Accessible task details");
  const list = await createRegularList(page, "Accessible launch list");
  const section = await createSection(page, list.id, "Accessible section");
  const movedTask = await moveTask(page, inboxTask, { listId: list.id, sectionId: section.id });
  const terminalTask = await createTask(page, {
    listId: inboxTask.listId,
    title: "Accessible completed task",
    priority: "medium",
  });
  await transitionTask(page, terminalTask, "completed");

  for (const route of ["/inbox", `/lists/${list.id}`, `/tasks/${movedTask.id}`, "/completed", "/settings"]) {
    await page.goto(route);
    if (route === `/lists/${list.id}`) await expect(taskRow(page, movedTask.id)).toBeVisible();
    if (route === `/tasks/${movedTask.id}`)
      await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(movedTask.title);
    if (route === "/completed") await expect(taskRow(page, terminalTask.id)).toBeVisible();
    await expectNoSevereViolations(page);
  }

  if (page.viewportSize()!.width >= 768) {
    await page.goto(`/lists/${list.id}?task=${movedTask.id}`);
    const taskDetails =
      page.viewportSize()!.width >= 1280
        ? page.getByRole("complementary", { name: "Task details" })
        : page.getByRole("dialog", { name: "Task details" });
    await expect(taskDetails).toBeVisible();
    await expectNoSevereViolations(page);
  }

  await page.goto("/inbox");
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Search tasks and commands" })).toBeVisible();
  await expectNoSevereViolations(page);
  await page.keyboard.press("Escape");

  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Writes are disabled until you reconnect.")).toBeVisible();
  await expectNoSevereViolations(page);
  await context.setOffline(false);
});

async function expectNoSevereViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const severeViolations = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(severeViolations).toEqual([]);
}
