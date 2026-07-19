import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { signUpThroughUi } from "./support/wp01-auth";
import { assertPriorityMarkers, readBaseTaskRowContract } from "./support/task-row-contract";
import { addTagToTask, quickAddTask, taskRow, updateTask } from "./support/wp03-tasks";

test("production TaskRow preserves the approved density, typography, and action targets", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await signUpThroughUi(page, testInfo);
  const created = await quickAddTask(page, "Review production task row");
  const prioritized = await updateTask(page, created, { priority: "high" });
  await addTagToTask(page, prioritized, "Launch");
  await page.reload();

  const row = taskRow(page, created.id);
  const status = row.getByRole("button", { name: `Complete ${created.title}` });
  const more = row.getByRole("button", { name: `More actions for ${created.title}` });
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: "high priority" })).toBeVisible();
  await expect(row).toContainText("Launch");
  await status.focus();
  await expect(status).toBeFocused();
  await more.focus();
  await expect(more).toBeFocused();
  await assertPriorityMarkers(page);

  const contract = await readBaseTaskRowContract(row);
  expect(contract.tokens).toEqual({
    fontSans:
      '"Geist Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    rowSize: "14px",
    rowLine: "20px",
    rowWeight: "500",
    compactSize: "13px",
    compactLine: "18px",
    compactWeight: "400",
    labelSize: "12px",
    labelLine: "16px",
    labelWeight: "600",
    contentGap: "4px",
    columnGap: "8px",
    desktopTarget: "36px",
    touchTarget: "44px",
    statusIndicator: "20px",
    standardHeight: "60px",
    touchHeight: "64px",
  });
  expect(contract.bodyFontFamily).toBe(contract.tokenFontFamily);
  expect(contract.title).toMatchObject({
    color: contract.semanticColors.text,
    fontFamily: contract.tokenFontFamily,
    fontSize: contract.tokens.rowSize,
    fontWeight: contract.tokens.rowWeight,
    lineHeight: contract.tokens.rowLine,
  });
  expect(contract.metadata).toMatchObject({
    color: contract.semanticColors.muted,
    fontFamily: contract.tokenFontFamily,
    fontSize: contract.tokens.compactSize,
    fontWeight: contract.tokens.compactWeight,
    lineHeight: contract.tokens.compactLine,
  });
  expect(contract.tag).toMatchObject({
    fontFamily: contract.tokenFontFamily,
    fontSize: contract.tokens.labelSize,
    fontWeight: contract.tokens.labelWeight,
    lineHeight: contract.tokens.labelLine,
  });
  expect(contract.contentGap).toBe(contract.tokens.contentGap);
  expect(contract.row.columnGap).toBe(contract.tokens.columnGap);
  expect(contract.metadata.box.top - contract.title.box.bottom).toBeCloseTo(
    pixels(contract.tokens.contentGap),
    1,
  );

  const expectedHeight = contract.coarsePointerAvailable
    ? contract.tokens.touchHeight
    : contract.tokens.standardHeight;
  const expectedTarget = pixels(
    contract.coarsePointerAvailable ? contract.tokens.touchTarget : contract.tokens.desktopTarget,
  );
  expect(contract.row.minHeight).toBe(expectedHeight);
  expect(contract.row.box.height).toBeGreaterThanOrEqual(pixels(expectedHeight));
  expect(contract.status.box.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.status.box.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.more.box.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.more.box.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.statusIndicatorBox.width).toBe(pixels(contract.tokens.statusIndicator));
  expect(contract.statusIndicatorBox.height).toBe(pixels(contract.tokens.statusIndicator));
  expect(contract.contentBox.right).toBeLessThanOrEqual(contract.trailingBox.left);
  if (contract.viewportWidth >= 390) expect(contract.title.textFits).toBe(true);
  expect(contract.metadata.textFits).toBe(true);

  if (contract.viewportWidth < 768) expect(contract.tag.display).toBe("none");
  else expect(contract.tag.display).not.toBe("none");

  const evidenceDirectory = path.resolve("artifacts/visual-proof/wp03");
  await mkdir(evidenceDirectory, { recursive: true });
  await more.evaluate((element) => (element as HTMLElement).blur());
  await row.screenshot({
    path: path.join(evidenceDirectory, `production-task-row-${testInfo.project.name}.png`),
    animations: "disabled",
  });
});

test("the public landing keeps labeled entry actions inside every boundary viewport", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make room for what matters." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Try demo" })).toBeVisible();

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.clientWidth).toBe(page.viewportSize()?.width);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

  const evidenceDirectory = path.resolve("artifacts/visual-proof/boundaries");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDirectory, `landing-${testInfo.project.name}.png`),
    animations: "disabled",
    fullPage: true,
  });
});

function pixels(value: string) {
  return Number.parseFloat(value);
}
