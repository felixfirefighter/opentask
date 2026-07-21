import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test, type Page, type Response, type Route, type TestInfo } from "@playwright/test";

const goldenPathProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const demoTask = {
  id: "50000000-0000-4000-8000-000000000001",
  title: "Outline the workshop agenda",
} as const;
const demoBreakId = "73000000-0000-4000-8000-000000000003";

test("a linked authoritative Focus session survives refresh and remains portable", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(!goldenPathProjects.has(testInfo.project.name), "G7 runs at desktop and mobile widths.");

  await enterIsolatedDemo(page, testInfo);
  await page.goto("/focus");
  await expect(page.getByRole("heading", { level: 1, name: "Focus" })).toBeVisible();

  const timer = page.getByRole("region", { name: "Focus timer" });
  const summary = page.getByRole("region", { name: "Summary" });
  const history = page.getByRole("region", { name: "Recent sessions" });
  const historyList = history.getByRole("list", { name: "Completed focus sessions" });
  const initialSummary = await readSummary(page);
  const initialHistory = await readHistory(page);

  expect(initialHistory.items).toHaveLength(2);
  expect(initialHistory.items.every(({ session }) => session.kind === "focus")).toBe(true);
  expect(initialHistory.items.map(({ session }) => session.id)).not.toContain(demoBreakId);
  await expect(historyList.getByRole("listitem")).toHaveCount(2);
  await expectSummaryDisplay(summary, initialSummary);
  await expectNoHorizontalOverflow(page, "initial Focus route");

  const linkPicker = timer.getByRole("combobox", { name: /Link to a task or habit/u });
  await linkPicker.fill(demoTask.title);
  const taskOption = page.getByRole("option", { name: `${demoTask.title}, Task`, exact: true });
  await expect(taskOption).toBeVisible();
  await linkPicker.press("Enter");
  await expect(timer.getByText(demoTask.title, { exact: true })).toBeVisible();

  const startPomodoro = waitForFocusResponse(page, "/api/v1/focus/sessions", "POST");
  await timer.getByRole("button", { name: "Start focus", exact: true }).click();
  const pomodoroStartResponse = await startPomodoro;
  expect(pomodoroStartResponse.status()).toBe(201);
  const pomodoroStart = (await pomodoroStartResponse.json()) as FocusStartWire;
  expect(pomodoroStart).toMatchObject({
    outcome: "created",
    snapshot: {
      session: {
        kind: "focus",
        mode: "pomodoro",
        state: "active",
        taskId: demoTask.id,
        habitId: null,
      },
      link: { id: demoTask.id, kind: "task", label: demoTask.title, availability: "available" },
    },
  });

  const pomodoroId = pomodoroStart.snapshot.session.id;
  const pauseResponsePromise = waitForFocusResponse(
    page,
    `/api/v1/focus/sessions/${pomodoroId}/pause`,
    "POST",
  );
  await timer.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await readSnapshotResponse(await pauseResponsePromise, "paused");
  expect(paused.session.id).toBe(pomodoroId);
  await expect(timer.getByText("Paused", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Focus" })).toBeVisible();
  await expect(timer.getByText("Paused", { exact: true })).toBeVisible();
  await expect(timer.getByText(demoTask.title, { exact: true })).toBeVisible();
  const authoritativePaused = await readActive(page);
  expect(authoritativePaused?.session).toMatchObject({ id: pomodoroId, state: "paused" });

  const resumeResponsePromise = waitForFocusResponse(
    page,
    `/api/v1/focus/sessions/${pomodoroId}/resume`,
    "POST",
  );
  await timer.getByRole("button", { name: "Resume", exact: true }).click();
  await readSnapshotResponse(await resumeResponsePromise, "active");
  await expect(timer.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  const finishPomodoro = waitForFocusResponse(page, `/api/v1/focus/sessions/${pomodoroId}/finish`, "POST");
  await timer.getByRole("button", { name: "Finish focus", exact: true }).click();
  const finishedPomodoro = await readSnapshotResponse(await finishPomodoro, "completed");
  expect(finishedPomodoro.session.id).toBe(pomodoroId);
  await expect(timer.getByRole("button", { name: "Start focus", exact: true })).toBeEnabled();
  await expect(historyList.getByRole("listitem")).toHaveCount(3);

  const pomodoroRow = historyList.getByRole("listitem").first();
  await expect(pomodoroRow).toContainText("Pomodoro");
  await expect(pomodoroRow).toContainText(demoTask.title);
  const summaryBeforeCorrection = await readSummary(page);
  await pomodoroRow.getByRole("button", { name: /More actions for focus session completed/u }).click();
  await page.getByRole("menuitem", { name: "Correct duration…" }).click();
  const correctionDialog = page.getByRole("dialog", { name: "Correct focus duration" });
  await expect(correctionDialog.getByLabel("Duration (seconds)")).toBeFocused();
  await correctionDialog.getByLabel("Duration (seconds)").fill("600");
  const correctionResponsePromise = waitForFocusResponse(
    page,
    `/api/v1/focus/sessions/${pomodoroId}`,
    "PATCH",
  );
  await correctionDialog.getByRole("button", { name: "Save correction" }).click();
  const correctionResponse = await correctionResponsePromise;
  expect(correctionResponse.status()).toBe(200);
  const corrected = (await correctionResponse.json()) as FocusSessionWire;
  expect(corrected).toMatchObject({ id: pomodoroId, accumulatedActiveSeconds: 600, taskId: demoTask.id });

  const summaryAfterCorrection = {
    todaySeconds:
      summaryBeforeCorrection.todaySeconds - finishedPomodoro.session.accumulatedActiveSeconds + 600,
    sevenDaySeconds:
      summaryBeforeCorrection.sevenDaySeconds - finishedPomodoro.session.accumulatedActiveSeconds + 600,
  };
  await expect(pomodoroRow).toContainText("10 min");
  await expectSummaryDisplay(summary, summaryAfterCorrection);
  await expectSummaryApi(page, summaryAfterCorrection);

  await timer.getByRole("radio", { name: "Stopwatch", exact: true }).check();
  await expect(timer.getByLabel("Stopwatch ready")).toHaveText("00:00");
  const startStopwatch = waitForFocusResponse(page, "/api/v1/focus/sessions", "POST");
  await timer.getByRole("button", { name: "Start focus", exact: true }).click();
  const stopwatchStart = (await (await startStopwatch).json()) as FocusStartWire;
  expect(stopwatchStart.snapshot.session).toMatchObject({ kind: "focus", mode: "stopwatch" });
  const stopwatchId = stopwatchStart.snapshot.session.id;
  const finishStopwatch = waitForFocusResponse(page, `/api/v1/focus/sessions/${stopwatchId}/finish`, "POST");
  await timer.getByRole("button", { name: "Finish focus", exact: true }).click();
  const finishedStopwatch = await readSnapshotResponse(await finishStopwatch, "completed");
  await expect(historyList.getByRole("listitem")).toHaveCount(4);
  await expect(historyList.getByRole("listitem").first()).toContainText("Stopwatch");

  const summaryBeforeBreak = await readSummary(page);
  expect(summaryBeforeBreak).toMatchObject({
    todaySeconds: summaryAfterCorrection.todaySeconds + finishedStopwatch.session.accumulatedActiveSeconds,
    sevenDaySeconds:
      summaryAfterCorrection.sevenDaySeconds + finishedStopwatch.session.accumulatedActiveSeconds,
  });

  await timer.getByRole("radio", { name: "Pomodoro", exact: true }).check();
  await timer.getByRole("spinbutton", { name: "Break length in minutes" }).fill("1");
  const startBreak = waitForFocusResponse(page, "/api/v1/focus/sessions", "POST");
  await timer.getByRole("button", { name: "Start break", exact: true }).click();
  const breakStart = (await (await startBreak).json()) as FocusStartWire;
  expect(breakStart.snapshot.session).toMatchObject({
    kind: "break",
    mode: "pomodoro",
    state: "active",
    taskId: null,
    habitId: null,
    plannedSeconds: 60,
  });
  const breakId = breakStart.snapshot.session.id;
  await expect(timer.getByText("Break", { exact: true })).toBeVisible();
  await expect(timer.getByText(/kept separate from Focus history and totals/u)).toBeVisible();
  const finishBreak = waitForFocusResponse(page, `/api/v1/focus/sessions/${breakId}/finish`, "POST");
  await timer.getByRole("button", { name: "Skip break", exact: true }).click();
  const finishedBreak = await readSnapshotResponse(await finishBreak, "completed");
  expect(finishedBreak.session.kind).toBe("break");

  const historyAfterBreak = await readHistory(page);
  expect(historyAfterBreak.items).toHaveLength(4);
  expect(historyAfterBreak.items.map(({ session }) => session.id)).not.toContain(breakId);
  const summaryAfterBreak = await readSummary(page);
  expect([summaryAfterBreak.todaySeconds, summaryAfterBreak.sevenDaySeconds]).toEqual([
    summaryBeforeBreak.todaySeconds,
    summaryBeforeBreak.sevenDaySeconds,
  ]);
  await expect(historyList.getByRole("listitem")).toHaveCount(4);

  await page.goto("/settings");
  const exportResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/export" && response.request().method() === "GET",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).click();
  const [exportResponse, download] = await Promise.all([exportResponsePromise, downloadPromise]);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["x-opentask-export-schema-version"]).toBe("5");
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadedPath!, "utf8")) as PortableExportWire;
  expect(exported.focus.schemaVersion).toBe(1);
  expect(exported.focus.sessions).toHaveLength(4);
  expect(exported.focus.sessions).toContainEqual(
    expect.objectContaining({
      id: pomodoroId,
      taskId: demoTask.id,
      accumulatedActiveSeconds: 600,
      mode: "pomodoro",
    }),
  );
  expect(exported.focus.sessions).toContainEqual(
    expect.objectContaining({ id: stopwatchId, mode: "stopwatch" }),
  );
  expect(exported.focus.sessions.map(({ id }) => id)).not.toContain(demoBreakId);
  expect(exported.focus.sessions.map(({ id }) => id)).not.toContain(breakId);

  await page.goto("/focus");
  await expect(historyList.getByRole("listitem")).toHaveCount(4);
  const stopwatchRow = historyList.getByRole("listitem").first();
  await expect(stopwatchRow).toContainText("Stopwatch");
  await stopwatchRow.getByRole("button", { name: /More actions for focus session completed/u }).click();
  await page.getByRole("menuitem", { name: "Delete session…" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete this focus session?" });
  await expect(deleteDialog.getByRole("button", { name: "Keep session" })).toBeFocused();
  const deleteResponsePromise = waitForFocusResponse(page, `/api/v1/focus/sessions/${stopwatchId}`, "DELETE");
  await deleteDialog.getByRole("button", { name: "Delete session" }).click();
  expect((await deleteResponsePromise).status()).toBe(200);
  await expect(historyList.getByRole("listitem")).toHaveCount(3);
  await expect
    .poll(async () => (await readHistory(page)).items.map(({ session }) => session.id))
    .not.toContain(stopwatchId);

  await context.setOffline(true);
  await expect(page.getByText("Focus is read-only", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Not connected; timer may still be running. No projected time will be saved offline."),
  ).toBeVisible();
  await expect(timer.getByRole("button", { name: "Start focus", exact: true })).toBeDisabled();
  await expect(timer.getByRole("button", { name: "Start break", exact: true })).toBeDisabled();
  await expectNoHorizontalOverflow(page, "offline Focus route");

  await context.setOffline(false);
  await expect(page.getByText("Focus is read-only", { exact: true })).toBeHidden();
  await expect(timer.getByRole("button", { name: "Start focus", exact: true })).toBeEnabled();
});

test("a history-only failure leaves the authoritative timer usable and recovers", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop history recovery is sufficient.");

  await enterIsolatedDemo(page, testInfo);
  await page.goto("/focus");
  const timer = page.getByRole("region", { name: "Focus timer" });
  const history = page.getByRole("region", { name: "Recent sessions" });
  const historyFailure = historyFailureRoute();
  await page.route("**/api/v1/focus/**", historyFailure);

  await timer.getByRole("radio", { name: "Stopwatch", exact: true }).check();
  const startResponse = waitForFocusResponse(page, "/api/v1/focus/sessions", "POST");
  await timer.getByRole("button", { name: "Start focus", exact: true }).click();
  const started = (await (await startResponse).json()) as FocusStartWire;
  const finishResponse = waitForFocusResponse(
    page,
    `/api/v1/focus/sessions/${started.snapshot.session.id}/finish`,
    "POST",
  );
  await timer.getByRole("button", { name: "Finish focus", exact: true }).click();
  expect((await finishResponse).status()).toBe(200);

  const alert = history.getByRole("alert");
  await expect(alert).toContainText("Focus history could not be loaded");
  await expect(alert).toContainText("Saved Focus history could not be loaded.");
  await expect(timer.getByRole("button", { name: "Start focus", exact: true })).toBeEnabled();

  await page.unroute("**/api/v1/focus/**", historyFailure);
  const retryResponse = waitForFocusResponse(page, "/api/v1/focus/sessions", "GET");
  await history.getByRole("button", { name: "Retry history" }).click();
  expect((await retryResponse).status()).toBe(200);
  await expect(alert).toBeHidden();
  await expect(
    history.getByRole("list", { name: "Completed focus sessions" }).getByRole("listitem"),
  ).toHaveCount(3);
});

async function enterIsolatedDemo(page: Page, testInfo: TestInfo): Promise<void> {
  const seed = randomUUID().replaceAll("-", "");
  const clientAddress = `2001:db8:${seed.slice(0, 4)}:${seed.slice(4, 8)}:${seed.slice(8, 12)}:${seed.slice(12, 16)}::1`;
  await page.setExtraHTTPHeaders({ "x-real-ip": clientAddress });
  await page.goto("/");
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/demo" && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Try demo" }).click();
  expect((await responsePromise).status(), `${testInfo.project.name} demo entry`).toBe(200);
  await expect(page).toHaveURL("/inbox", { timeout: 30_000 });
}

function waitForFocusResponse(
  page: Page,
  pathname: string,
  method: "DELETE" | "GET" | "PATCH" | "POST",
): Promise<Response> {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === pathname && response.request().method() === method,
  );
}

async function readSnapshotResponse(response: Response, state: FocusSessionWire["state"]) {
  expect(response.status()).toBe(200);
  const snapshot = (await response.json()) as FocusSnapshotWire;
  expect(snapshot.session.state).toBe(state);
  return snapshot;
}

async function readActive(page: Page): Promise<FocusSnapshotWire | null> {
  const response = await page.context().request.get("/api/v1/focus/active");
  expect(response.status()).toBe(200);
  return (await response.json()) as FocusSnapshotWire | null;
}

async function readSummary(page: Page): Promise<FocusSummaryWire> {
  const response = await page.context().request.get("/api/v1/focus/summary");
  expect(response.status()).toBe(200);
  return (await response.json()) as FocusSummaryWire;
}

async function readHistory(page: Page): Promise<FocusHistoryWire> {
  const response = await page.context().request.get("/api/v1/focus/sessions");
  expect(response.status()).toBe(200);
  return (await response.json()) as FocusHistoryWire;
}

async function expectSummaryDisplay(
  summary: ReturnType<Page["getByRole"]>,
  expected: Pick<FocusSummaryWire, "todaySeconds" | "sevenDaySeconds">,
): Promise<void> {
  await expect(summary.getByText("Today", { exact: true }).locator("xpath=..")).toContainText(
    formatFocusDuration(expected.todaySeconds),
  );
  await expect(summary.getByText("Last seven days", { exact: true }).locator("xpath=..")).toContainText(
    formatFocusDuration(expected.sevenDaySeconds),
  );
}

async function expectSummaryApi(
  page: Page,
  expected: Pick<FocusSummaryWire, "todaySeconds" | "sevenDaySeconds">,
): Promise<void> {
  await expect
    .poll(async () => {
      const summary = await readSummary(page);
      return [summary.todaySeconds, summary.sevenDaySeconds];
    })
    .toEqual([expected.todaySeconds, expected.sevenDaySeconds]);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.body, `${label} body overflow`).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.document, `${label} document overflow`).toBeLessThanOrEqual(widths.viewport + 1);
}

function historyFailureRoute() {
  return async (route: Route) => {
    const request = route.request();
    if (request.method() !== "GET" || new URL(request.url()).pathname !== "/api/v1/focus/sessions") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:opentask:problem:internal",
        title: "Focus history unavailable",
        status: 503,
        code: "INTERNAL",
        detail: "The saved Focus history could not be loaded.",
        correlationId: "g7-history-failure",
      }),
    });
  };
}

function formatFocusDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 1) return "Less than 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

type FocusSessionWire = Readonly<{
  id: string;
  kind: "focus" | "break";
  mode: "pomodoro" | "stopwatch";
  state: "active" | "paused" | "completed";
  taskId: string | null;
  habitId: string | null;
  accumulatedActiveSeconds: number;
  plannedSeconds: number | null;
  version: number;
}>;

type FocusSnapshotWire = Readonly<{
  session: FocusSessionWire;
  link: Readonly<{
    id: string;
    kind: "task" | "habit";
    label: string | null;
    availability: "available" | "unavailable";
  }> | null;
}>;

type FocusStartWire = Readonly<{
  outcome: "created" | "idempotent_retry" | "recovered_existing";
  snapshot: FocusSnapshotWire;
}>;

type FocusSummaryWire = Readonly<{
  todaySeconds: number;
  sevenDaySeconds: number;
}>;

type FocusHistoryWire = Readonly<{
  items: ReadonlyArray<Readonly<{ session: FocusSessionWire }>>;
}>;

type PortableExportWire = Readonly<{
  focus: Readonly<{
    schemaVersion: number;
    sessions: ReadonlyArray<
      Readonly<{
        id: string;
        taskId: string | null;
        habitId: string | null;
        accumulatedActiveSeconds: number;
        mode: "pomodoro" | "stopwatch";
      }>
    >;
  }>;
}>;
