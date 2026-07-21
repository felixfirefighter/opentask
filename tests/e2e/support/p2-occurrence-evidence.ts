import { expect, type Page, type Route } from "@playwright/test";

export const P2_OCCURRENCE_DEMO = {
  taskId: "50000000-0000-4000-8000-000000000011",
  taskTitle: "Review workshop progress",
} as const;

type TodayProjectionWire = Readonly<{
  overdue: readonly OccurrenceProjectionWire[];
  timed: readonly OccurrenceProjectionWire[];
  anytime: readonly OccurrenceProjectionWire[];
}>;

type OccurrenceProjectionWire = Readonly<{
  id: string;
  occurrenceKey: string | null;
  occurrenceState: "open" | "completed" | "skipped" | null;
  projectionLifecycle: "one_off" | "recurring_occurrence" | "recurrence_summary";
}>;

export async function readOpenDemoOccurrenceKey(page: Page): Promise<string> {
  const response = await page.context().request.get("/api/v1/planning/today");
  expect(response.status()).toBe(200);
  const projection = (await response.json()) as TodayProjectionWire;
  const occurrence = [...projection.overdue, ...projection.timed, ...projection.anytime].find(
    (row) =>
      row.id === P2_OCCURRENCE_DEMO.taskId &&
      row.projectionLifecycle === "recurring_occurrence" &&
      row.occurrenceState === "open",
  );
  expect(occurrence?.occurrenceKey, "The isolated demo exposes one open occurrence today.").toBeTruthy();
  if (!occurrence?.occurrenceKey) throw new Error("The isolated demo occurrence is unavailable.");
  return occurrence.occurrenceKey;
}

export function occurrenceDetailPath(occurrenceKey: string, returnTo = "/today"): string {
  const query = new URLSearchParams({ occurrence: occurrenceKey, returnTo });
  return `/tasks/${P2_OCCURRENCE_DEMO.taskId}?${query.toString()}`;
}

export function unavailableDemoOccurrenceKey(): string {
  // A valid whole-minute o1 identity before the demo series cutover, with no recorded event.
  const payload = `${P2_OCCURRENCE_DEMO.taskId}|t|946717260000`;
  return `o1.${Buffer.from(payload, "ascii").toString("base64url")}`;
}

export async function applyOccurrenceWithoutDeliveringResponse(page: Page): Promise<void> {
  const pattern = `**/api/v1/tasks/${P2_OCCURRENCE_DEMO.taskId}/occurrences/transition`;
  let upstreamStatus: number | null = null;
  const handler = async (route: Route) => {
    const response = await route.fetch();
    upstreamStatus = response.status();
    await route.abort("failed");
  };

  await page.route(pattern, handler, { times: 1 });
  try {
    await page.getByRole("button", { name: "Complete occurrence", exact: true }).click();
    await expect
      .poll(() => upstreamStatus, { message: "The occurrence command reached the server." })
      .toBe(200);
  } finally {
    await page.unroute(pattern, handler);
  }
}
