import { randomUUID } from "node:crypto";

import { expect, type APIResponse, type Locator, type Page } from "@playwright/test";

const APP_ORIGIN = "http://127.0.0.1:3107";

export type TaskWireRecord = Readonly<{
  id: string;
  listId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  title: string;
  descriptionMd: string;
  priority: "none" | "low" | "medium" | "high";
  status: "open" | "completed" | "cancelled";
  version: number;
}>;

export type OrganizerWireRecord = Readonly<{
  id: string;
  name: string;
  version: number;
}>;

export function taskRow(page: Page, taskId: string) {
  return page.locator(`[data-ui="task-row"][data-task-id="${taskId}"]`);
}

export async function quickAddTask(page: Page, title: string): Promise<TaskWireRecord> {
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname === "/api/v1/tasks" && request.method() === "POST";
  });
  const input = page.getByLabel("New task", { exact: true });
  const composer = page.locator("form").filter({ has: input });

  await page.getByRole("button", { name: "Add task", exact: true }).first().click();
  await expect(input).toBeFocused();
  await input.fill(title);
  await expect(composer.getByRole("button", { name: "Add task", exact: true })).toBeEnabled();
  await input.press("Enter");

  const task = await readMutationResponse<TaskWireRecord>(await responsePromise);
  expect(task).toMatchObject({ title, status: "open", priority: "none", version: 1 });
  await expect(taskRow(page, task.id)).toBeVisible();
  await expect(input).toHaveValue("");
  return task;
}

export async function createRegularList(
  page: Page,
  name: string,
  folderId: string | null = null,
): Promise<OrganizerWireRecord> {
  return postJson<OrganizerWireRecord>(
    page,
    "/api/v1/lists",
    { name, colorToken: "coral", folderId, placement: { kind: "end" } },
    randomUUID(),
  );
}

export async function createSection(page: Page, listId: string, name: string): Promise<OrganizerWireRecord> {
  return postJson<OrganizerWireRecord>(
    page,
    `/api/v1/lists/${listId}/sections`,
    { name, placement: { kind: "end" } },
    randomUUID(),
  );
}

export async function createTask(
  page: Page,
  input: Readonly<{
    listId: string;
    title: string;
    priority?: TaskWireRecord["priority"];
    sectionId?: string | null;
  }>,
): Promise<TaskWireRecord> {
  return postJson<TaskWireRecord>(
    page,
    "/api/v1/tasks",
    {
      title: input.title,
      descriptionMd: "",
      priority: input.priority ?? "none",
      listId: input.listId,
      sectionId: input.sectionId ?? null,
      parentTaskId: null,
      placement: { kind: "start" },
    },
    randomUUID(),
  );
}

export async function updateTask(
  page: Page,
  task: TaskWireRecord,
  patch: Readonly<Partial<Pick<TaskWireRecord, "descriptionMd" | "priority" | "title">>>,
): Promise<TaskWireRecord> {
  const response = await page.context().request.patch(`/api/v1/tasks/${task.id}`, {
    data: { expectedVersion: task.version, patch },
    headers: mutationHeaders(),
  });
  return readMutationResponse<TaskWireRecord>(response);
}

export async function moveTask(
  page: Page,
  task: TaskWireRecord,
  destination: Readonly<{ listId: string; sectionId: string | null }>,
): Promise<TaskWireRecord> {
  return postJson<TaskWireRecord>(page, `/api/v1/tasks/${task.id}/move`, {
    expectedVersion: task.version,
    listId: destination.listId,
    sectionId: destination.sectionId,
    parentTaskId: null,
    placement: { kind: "end" },
  });
}

export async function transitionTask(
  page: Page,
  task: TaskWireRecord,
  status: TaskWireRecord["status"],
): Promise<TaskWireRecord> {
  return postJson<TaskWireRecord>(page, `/api/v1/tasks/${task.id}/status`, {
    expectedVersion: task.version,
    status,
  });
}

export async function addTagToTask(page: Page, task: TaskWireRecord, name: string): Promise<TaskWireRecord> {
  const tag = await postJson<OrganizerWireRecord & { colorToken: string }>(
    page,
    "/api/v1/tags",
    { name, colorToken: "sky" },
    randomUUID(),
  );
  const result = await postJson<{ task: { id: string; version: number } }>(
    page,
    `/api/v1/tasks/${task.id}/tags`,
    { expectedVersion: task.version, tagIds: [tag.id] },
  );
  return { ...task, version: result.task.version };
}

export async function openTaskFromRow(page: Page, task: TaskWireRecord) {
  await taskRow(page, task.id).getByRole("link").click();

  if (page.viewportSize()!.width >= 768) {
    await expect(page).toHaveURL(new RegExp(`/inbox\\?task=${task.id}$`, "u"));
    await expect(page.getByRole("complementary", { name: "Task details" })).toBeVisible();
  } else {
    await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}$`, "u"));
    await expect(page.getByRole("complementary", { name: "Task details" })).toHaveCount(0);
  }
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(task.title, {
    timeout: 15_000,
  });
}

export async function closeTaskDetails(page: Page, taskId: string) {
  if (page.viewportSize()!.width >= 768) {
    await page.getByRole("button", { name: "Close task details" }).click();
    await expect(page).toHaveURL(/\/inbox$/u);
    await expect(taskRow(page, taskId).getByRole("link")).toBeFocused();
  } else {
    await page.getByRole("link", { name: "Back to task list" }).click();
    await expect(page).toHaveURL(/\/inbox$/u);
  }
}

export async function selectCommandOptionWithKeyboard(page: Page, option: Locator) {
  await expect(option).toBeVisible();
  const optionCount = await page.getByRole("option").count();
  for (let step = 0; step <= optionCount; step += 1) {
    if ((await option.getAttribute("aria-selected")) === "true") return;
    await page.keyboard.press("ArrowDown");
  }
  await expect(option).toHaveAttribute("aria-selected", "true");
}

export function waitForTaskSearch(page: Page, query: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/tasks/search" && url.searchParams.get("q") === query;
  });
}

export function taskProblem(code: "CONFLICT" | "INTERNAL", currentVersion?: number) {
  const status = code === "CONFLICT" ? 409 : 500;
  return {
    type: `urn:opentask:problem:${code.toLocaleLowerCase()}`,
    title: code === "CONFLICT" ? "Conflict" : "Unexpected error",
    status,
    code,
    detail: code === "CONFLICT" ? "This task changed elsewhere." : "The request failed safely.",
    correlationId: `wp03-${code.toLocaleLowerCase()}`,
    ...(currentVersion ? { currentVersion } : {}),
  };
}

async function postJson<T>(page: Page, path: string, data: unknown, idempotencyKey?: string): Promise<T> {
  const response = await page.context().request.post(path, {
    data,
    headers: mutationHeaders(idempotencyKey),
  });
  return readMutationResponse<T>(response);
}

async function readMutationResponse<T>(response: Pick<APIResponse, "json" | "status">): Promise<T> {
  expect([200, 201]).toContain(response.status());
  return (await response.json()) as T;
}

function mutationHeaders(idempotencyKey?: string) {
  return {
    origin: APP_ORIGIN,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}
