import { describe, expect, it } from "vitest";

import {
  TASK_CONTAINER_NAME_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  normalizeChecklistTitle,
  normalizeFolderName,
  normalizeListName,
  normalizeSectionName,
  normalizeTagName,
  normalizeTaskTitle,
  validateTaskDescription,
} from "./task-text";

describe("task text values", () => {
  it.each([
    [normalizeFolderName, "  Personal  ", "Personal"],
    [normalizeListName, "  Launch  ", "Launch"],
    [normalizeSectionName, "  Next  ", "Next"],
    [normalizeTagName, "  Deep Work  ", "Deep Work"],
    [normalizeTaskTitle, "  Ship the demo  ", "Ship the demo"],
    [normalizeChecklistTitle, "  Record the clip  ", "Record the clip"],
  ])("trims and preserves display text", (normalize, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it.each([
    normalizeFolderName,
    normalizeListName,
    normalizeSectionName,
    normalizeTagName,
    normalizeTaskTitle,
    normalizeChecklistTitle,
  ])("rejects blank required text", (normalize) => {
    expect(() => normalize(" \n\t ")).toThrowError(expect.objectContaining({ reason: "BLANK" }));
  });

  it("enforces container, task, checklist, and description bounds", () => {
    expect(normalizeFolderName("f".repeat(TASK_CONTAINER_NAME_MAX_LENGTH))).toHaveLength(
      TASK_CONTAINER_NAME_MAX_LENGTH,
    );
    expect(() => normalizeFolderName("f".repeat(TASK_CONTAINER_NAME_MAX_LENGTH + 1))).toThrow();
    expect(normalizeTaskTitle("t".repeat(TASK_TITLE_MAX_LENGTH))).toHaveLength(TASK_TITLE_MAX_LENGTH);
    expect(() => normalizeChecklistTitle("c".repeat(TASK_TITLE_MAX_LENGTH + 1))).toThrow();
    expect(validateTaskDescription("d".repeat(TASK_DESCRIPTION_MAX_LENGTH))).toHaveLength(
      TASK_DESCRIPTION_MAX_LENGTH,
    );
    expect(() => validateTaskDescription("d".repeat(TASK_DESCRIPTION_MAX_LENGTH + 1))).toThrow();
  });

  it("counts Unicode code points and canonicalizes composed display values", () => {
    expect(normalizeTaskTitle(` ${"😀".repeat(TASK_TITLE_MAX_LENGTH)} `)).toHaveLength(
      TASK_TITLE_MAX_LENGTH * 2,
    );
    expect(() => normalizeTaskTitle("😀".repeat(TASK_TITLE_MAX_LENGTH + 1))).toThrow();
    expect(normalizeTaskTitle(" Cafe\u0301 ")).toBe("Café");
  });

  it("preserves Markdown description whitespace and content", () => {
    const markdown = "  - first item  \n\n`code`\n";
    expect(validateTaskDescription(markdown)).toBe(markdown);
  });

  it.each(["\ud800", "\udc00", "contains\0null"])(
    "rejects text PostgreSQL cannot store losslessly",
    (unsafeText) => {
      for (const normalize of [
        normalizeFolderName,
        normalizeListName,
        normalizeSectionName,
        normalizeTagName,
        normalizeTaskTitle,
        normalizeChecklistTitle,
      ]) {
        expect(() => normalize(unsafeText)).toThrowError(expect.objectContaining({ reason: "UNSAFE" }));
      }
      expect(() => validateTaskDescription(unsafeText)).toThrowError(
        expect.objectContaining({ reason: "UNSAFE" }),
      );
    },
  );
});
