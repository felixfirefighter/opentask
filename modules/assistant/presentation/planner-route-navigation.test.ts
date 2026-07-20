import { describe, expect, it } from "vitest";

import { plannerProposalFixture, taskIds } from "./planner-presentation-fixtures";
import {
  plannerProposalHref,
  plannerTaskHref,
  taskLinksForAppliedSelection,
} from "./planner-route-navigation";

describe("planner route navigation", () => {
  it("keeps task details anchored to the persisted proposal return context", () => {
    expect(plannerProposalHref(plannerProposalFixture.id)).toBe(
      `/plan?proposal=${plannerProposalFixture.id}`,
    );
    expect(plannerTaskHref(taskIds.review, plannerProposalFixture.id)).toBe(
      `/tasks/${taskIds.review}?returnTo=%2Fplan%3Fproposal%3D${plannerProposalFixture.id}`,
    );
  });

  it("deduplicates applied task targets, uses reviewed titles, and excludes defer", () => {
    expect(
      taskLinksForAppliedSelection(plannerProposalFixture, plannerProposalFixture.proposal.actions),
    ).toEqual([
      { id: "66666666-6666-4666-8666-666666666666", title: "Draft workshop notes" },
      { id: taskIds.notes, title: "Prepare organized attendee notes" },
      { id: taskIds.review, title: "Review workshop checklist" },
    ]);
  });
});
