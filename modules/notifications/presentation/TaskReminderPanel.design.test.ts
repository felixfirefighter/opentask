import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("TaskReminderPanel target-size contract", () => {
  it("keeps the destructive confirmation compact on desktop and touch-sized on mobile or coarse pointers", async () => {
    const source = await readFile("modules/notifications/presentation/TaskReminderPanel.module.css", "utf8");

    expect(source).toMatch(/\.dangerAction\s*\{[^}]*min-height:\s*var\(--control-target-desktop\);[^}]*\}/u);
    expect(source).toMatch(
      /@media\s*\(max-width:\s*767px\),\s*\(any-pointer:\s*coarse\)\s*\{\s*\.dangerAction\s*\{\s*min-height:\s*var\(--control-target-touch\);\s*\}\s*\}/u,
    );
  });
});
