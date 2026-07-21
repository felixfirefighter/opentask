import { describe, expect, it } from "vitest";

import { reconcileHabitDraft } from "./habit-draft-reconciliation";

describe("habit draft reconciliation", () => {
  it("preserves dirty fields while adopting successive latest values for untouched fields", () => {
    const base = { title: "Base", icon: "☀️", weekdays: [1, 3] as readonly number[] };
    const current = { ...base, title: "Local" };
    const latest = { title: "Remote", icon: "🔥", weekdays: [1, 3, 5] as readonly number[] };

    const reviewed = reconcileHabitDraft(base, current, latest);
    expect(reviewed).toEqual({ title: "Local", icon: "🔥", weekdays: [1, 3, 5] });

    expect(
      reconcileHabitDraft(latest, reviewed, {
        title: "Remote again",
        icon: "🌿",
        weekdays: [2, 4] as readonly number[],
      }),
    ).toEqual({ title: "Local", icon: "🌿", weekdays: [2, 4] });
  });
});
