import { expect, type Locator, type Page } from "@playwright/test";

import type { TaskWireRecord } from "./wp03-tasks";

const APP_ORIGIN = "http://127.0.0.1:3107";

export type TestSchedule =
  | Readonly<{ kind: "all_day"; startDate: string; endDate: string }>
  | Readonly<{ kind: "timed"; startAt: string; endAt: string; timezone: string }>;

export type ScheduleMutationResult = Readonly<{
  task: Readonly<{ id: string; version: number }>;
  schedule: (TestSchedule & Readonly<{ taskId: string; createdAt: string; updatedAt: string }>) | null;
}>;

export async function configureTestTimeZone(page: Page, timezone = "Asia/Singapore") {
  const current = await page.context().request.get("/api/v1/preferences");
  expect(current.status()).toBe(200);
  const preferences = (await current.json()) as { version: number };
  const updated = await page.context().request.patch("/api/v1/preferences", {
    data: { expectedVersion: preferences.version, patch: { timezone } },
    headers: { origin: APP_ORIGIN },
  });
  expect(updated.status()).toBe(200);
  return (await updated.json()) as { timezone: string; version: number };
}

export async function setTaskSchedule(
  page: Page,
  task: TaskWireRecord,
  schedule: TestSchedule,
): Promise<Readonly<{ task: TaskWireRecord; result: ScheduleMutationResult }>> {
  const response = await page.context().request.patch(`/api/v1/tasks/${task.id}/schedule`, {
    data: { expectedVersion: task.version, schedule },
    headers: { origin: APP_ORIGIN },
  });
  expect(response.status()).toBe(200);
  const result = (await response.json()) as ScheduleMutationResult;
  expect(result.task.id).toBe(task.id);
  expect(result.schedule).toMatchObject(schedule);
  return { task: { ...task, version: result.task.version }, result };
}

export async function readTaskSchedule(page: Page, taskId: string) {
  const response = await page.context().request.get(`/api/v1/tasks/${taskId}/schedule`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ScheduleMutationResult["schedule"];
}

export function planningTaskRow(page: Page, title: string): Locator {
  return page.getByRole("main").locator('[data-ui="planning-task-row"]').filter({ hasText: title });
}

export function calendarEvent(page: Page, title: string): Locator {
  return page
    .getByLabel(new RegExp(`^${escapeRegExp(title)},`, "u"))
    .filter({ visible: true })
    .first();
}

export function calendarDateCell(page: Page, localDate: string): Locator {
  return page.locator(`[role="gridcell"][data-date="${localDate}"]`);
}

export function localDateIn(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addLocalDays(localDate: string, days: number) {
  const value = new Date(`${localDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function singaporeInstant(localDate: string, localTime: string) {
  return new Date(`${localDate}T${localTime}:00+08:00`).toISOString();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
