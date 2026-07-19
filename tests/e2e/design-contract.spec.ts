import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { signUpThroughUi } from "./support/wp01-auth";
import {
  assertPriorityMarkers,
  readBaseTaskRowContract,
  readTaskRowState,
} from "./support/task-row-contract";
import { addTagToTask, quickAddTask, taskRow, updateTask } from "./support/wp03-tasks";

test("task row consumes the canonical density and typography tokens", async ({ page }, testInfo) => {
  await page.goto("/today");
  await page.waitForLoadState("networkidle");

  const row = page.locator('[data-ui="task-row"]').filter({ hasText: "Record the two-minute demo" }).first();
  const status = row.getByRole("button", { name: "Complete Record the two-minute demo" });
  const more = row.getByRole("button", { name: "More actions for Record the two-minute demo" });
  const title = row.locator('[data-ui-part="title"]');
  const metadata = row.locator('[data-ui-part="metadata"]');

  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: "high priority" })).toBeVisible();
  await expect(title).toBeVisible();
  await expect(metadata).toBeVisible();
  await expect(status).toBeVisible();
  await expect(status).toBeEnabled();
  await expect(status).toHaveAttribute("title", "Complete Record the two-minute demo");
  await expect(more).toBeVisible();
  await expect(more).toBeEnabled();
  await expect(more).toHaveAttribute("title", "More actions for Record the two-minute demo");
  expect(await status.evaluate((element) => (element as HTMLElement).tabIndex)).toBeGreaterThanOrEqual(0);
  expect(await more.evaluate((element) => (element as HTMLElement).tabIndex)).toBeGreaterThanOrEqual(0);
  await row.scrollIntoViewIfNeeded();
  await status.click({ trial: true });
  await more.click({ trial: true });
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
  for (const descendant of contract.titleDescendants) {
    expect(descendant).toMatchObject({
      fontFamily: contract.tokenFontFamily,
      fontSize: contract.tokens.rowSize,
      fontWeight: contract.tokens.rowWeight,
      lineHeight: contract.tokens.rowLine,
    });
  }
  expect(contract.contentGap).toBe(contract.tokens.contentGap);
  expect(contract.contentPadding).toEqual([
    contract.tokens.contentGap,
    "0px",
    contract.tokens.contentGap,
    "0px",
  ]);
  expect(contract.row.columnGap).toBe(contract.tokens.columnGap);
  expect(contract.tag.padding).toEqual([
    contract.tokens.contentGap,
    contract.tokens.columnGap,
    contract.tokens.contentGap,
    contract.tokens.columnGap,
  ]);

  const isTouchLayout = contract.coarsePointerAvailable;
  const isNarrowLayout = contract.viewportWidth < 768;
  const expectedHeight = isTouchLayout ? contract.tokens.touchHeight : contract.tokens.standardHeight;
  const expectedTarget = pixels(isTouchLayout ? contract.tokens.touchTarget : contract.tokens.desktopTarget);

  expect(contract.row.minHeight).toBe(expectedHeight);
  expect(contract.row.box.height).toBeGreaterThanOrEqual(pixels(expectedHeight));
  expect(contract.status.box.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.status.box.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.more.box.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.more.box.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(contract.statusIndicatorBox.width).toBe(pixels(contract.tokens.statusIndicator));
  expect(contract.statusIndicatorBox.height).toBe(pixels(contract.tokens.statusIndicator));
  expect(contract.title).toMatchObject({ clipPath: "none", opacity: "1", visibility: "visible" });
  expect(contract.metadata).toMatchObject({ clipPath: "none", opacity: "1", visibility: "visible" });
  expect(contract.status).toMatchObject({
    clipPath: "none",
    display: "flex",
    opacity: "1",
    pointerEvents: "auto",
    visibility: "visible",
  });
  expect(contract.more).toMatchObject({
    clipPath: "none",
    display: "flex",
    opacity: "1",
    pointerEvents: "auto",
    visibility: "visible",
  });
  expect(contract.priority).toMatchObject({
    clipPath: "none",
    opacity: "1",
    visibility: "visible",
  });
  expect(contract.priority.display).not.toBe("none");
  expect(contract.priority.box.width).toBeGreaterThan(0);
  expect(contract.priority.box.height).toBeGreaterThan(0);
  if (contract.viewportWidth >= 390) {
    expect(contract.title.textFits).toBe(true);
    expect(contract.metadata.textFits).toBe(true);
  }
  expect(contract.metadata.box.top - contract.title.box.bottom).toBeCloseTo(
    pixels(contract.tokens.contentGap),
    1,
  );
  expect(contract.title.box.top - contract.contentBox.top).toBeCloseTo(pixels(contract.tokens.contentGap), 1);
  expect(contract.contentBox.bottom - contract.metadata.box.bottom).toBeCloseTo(
    pixels(contract.tokens.contentGap),
    1,
  );
  expect(contract.contentBox.top - contract.row.box.top).toBeCloseTo(
    contract.row.box.bottom - pixels(contract.row.borderBottomWidth) - contract.contentBox.bottom,
    1,
  );
  expect(contract.row.box.top).toBeLessThanOrEqual(contract.title.box.top);
  expect(contract.metadata.box.bottom).toBeLessThanOrEqual(contract.row.box.bottom);
  expect(contract.contentBox.right).toBeLessThanOrEqual(contract.trailingBox.left);
  expect(contract.status.box.right).toBeLessThanOrEqual(contract.contentBox.left);
  expect(contract.trailingBox.right).toBeLessThanOrEqual(contract.row.box.right);
  expect(contract.status.box.left).toBeGreaterThanOrEqual(contract.row.box.left);
  expect(contract.status.box.right).toBeLessThanOrEqual(contract.row.box.right);
  expect(contract.more.box.left).toBeGreaterThanOrEqual(contract.row.box.left);
  expect(contract.more.box.right).toBeLessThanOrEqual(contract.row.box.right);
  expect((contract.status.box.top + contract.status.box.bottom) / 2).toBeCloseTo(
    (contract.row.box.top + contract.row.box.bottom - pixels(contract.row.borderBottomWidth)) / 2,
    1,
  );
  expect((contract.more.box.top + contract.more.box.bottom) / 2).toBeCloseTo(
    (contract.row.box.top + contract.row.box.bottom - pixels(contract.row.borderBottomWidth)) / 2,
    1,
  );

  if (isNarrowLayout) expect(contract.tag.display).toBe("none");
  else {
    expect(contract.tag).toMatchObject({
      clipPath: "none",
      opacity: "1",
      visibility: "visible",
    });
    expect(contract.tag.display).not.toBe("none");
  }

  const evidenceDirectory = path.resolve("artifacts/visual-proof/components");
  await mkdir(evidenceDirectory, { recursive: true });
  await more.evaluate((element) => (element as HTMLElement).blur());
  await row.screenshot({
    path: path.join(evidenceDirectory, `task-row-${testInfo.project.name}.png`),
    animations: "disabled",
  });

  await status.focus();
  await status.press("Enter");
  const completedStatus = row.getByRole("button", { name: "Mark Record the two-minute demo incomplete" });
  await expect(completedStatus).toBeFocused();
  await expect(completedStatus).toHaveAttribute("aria-pressed", "true");
  await expect(completedStatus).toHaveAttribute("title", "Mark Record the two-minute demo incomplete");
  const completedState = await readTaskRowState(row);
  expect(completedState.title).toMatchObject({
    clipPath: "none",
    color: completedState.mutedColor,
    display: "block",
    fontFamily: completedState.tokenFontFamily,
    fontSize: contract.tokens.rowSize,
    fontWeight: contract.tokens.rowWeight,
    lineHeight: contract.tokens.rowLine,
    opacity: "1",
    visibility: "visible",
  });
  expect(completedState.title.textDecorationLine).toContain("line-through");
  expect(completedState.indicator.width).toBe(pixels(contract.tokens.statusIndicator));
  expect(completedState.indicator.height).toBe(pixels(contract.tokens.statusIndicator));
  for (const descendant of completedState.titleDescendants) {
    expect(descendant).toMatchObject({
      fontFamily: completedState.tokenFontFamily,
      fontSize: contract.tokens.rowSize,
      fontWeight: contract.tokens.rowWeight,
      lineHeight: contract.tokens.rowLine,
    });
  }
  expect(completedState.metadata).toMatchObject({
    clipPath: "none",
    opacity: "1",
    visibility: "visible",
  });
  expect(completedState.status).toMatchObject({
    clipPath: "none",
    display: "flex",
    opacity: "1",
    pointerEvents: "auto",
    visibility: "visible",
  });
  expect(completedState.more).toMatchObject({
    clipPath: "none",
    display: "flex",
    opacity: "1",
    pointerEvents: "auto",
    visibility: "visible",
  });
  await completedStatus.click({ trial: true });
  await more.click({ trial: true });
  await assertPriorityMarkers(page);

  await completedStatus.press("Enter");
  await expect(status).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Use dark theme" }).first().click();
  const darkState = await readTaskRowState(row);
  expect(darkState.title).toMatchObject({
    clipPath: "none",
    color: darkState.textColor,
    display: "block",
    fontFamily: darkState.tokenFontFamily,
    fontSize: contract.tokens.rowSize,
    fontWeight: contract.tokens.rowWeight,
    lineHeight: contract.tokens.rowLine,
    opacity: "1",
    visibility: "visible",
  });
  expect(darkState.metadata).toMatchObject({
    clipPath: "none",
    color: darkState.mutedColor,
    fontFamily: darkState.tokenFontFamily,
    fontSize: contract.tokens.compactSize,
    fontWeight: contract.tokens.compactWeight,
    lineHeight: contract.tokens.compactLine,
    opacity: "1",
    visibility: "visible",
  });
  expect(darkState.rowMinHeight).toBe(expectedHeight);
  expect(darkState.status.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(darkState.status.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(darkState.more.width).toBeGreaterThanOrEqual(expectedTarget);
  expect(darkState.more.height).toBeGreaterThanOrEqual(expectedTarget);
  expect(darkState.status).toMatchObject({
    clipPath: "none",
    display: "flex",
    opacity: "1",
    pointerEvents: "auto",
    visibility: "visible",
  });
  expect(darkState.more).toMatchObject({
    clipPath: "none",
    display: "flex",
    opacity: "1",
    pointerEvents: "auto",
    visibility: "visible",
  });
  if (darkState.viewportWidth >= 768) {
    expect(darkState.tag).toMatchObject({
      clipPath: "none",
      opacity: "1",
      visibility: "visible",
    });
    expect(darkState.tag.display).not.toBe("none");
  }
  await status.click({ trial: true });
  await more.click({ trial: true });
  await assertPriorityMarkers(page);
});

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

function pixels(value: string) {
  return Number.parseFloat(value);
}
