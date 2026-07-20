import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EisenhowerProjection } from "../application/public";
import { MatrixRouteScreen } from "./MatrixRouteScreen";

const controller = vi.hoisted(() => ({
  announcement: "",
  closeSchedule: vi.fn(),
  condition: { kind: "ready" } as const,
  conflictedTaskId: null,
  retry: vi.fn(),
  saveSchedule: vi.fn(),
  scheduleTask: null,
  taskActions: {},
}));

vi.mock("./MatrixScreen", () => ({
  MatrixScreen: ({ condition }: { condition: { kind: string; message?: string } }) => (
    <div>
      <span data-testid="matrix-condition">{condition.kind}</span>
      <span>{condition.message}</span>
    </div>
  ),
}));
vi.mock("./PlanningLiveRegion", () => ({ PlanningLiveRegion: () => null }));
vi.mock("./ScheduleEditorDialog", () => ({ ScheduleEditorDialog: () => null }));
vi.mock("./use-planning-projection-freshness", () => ({
  usePlanningProjectionFreshness: () => ({ announcement: "", pendingLocalDateLabel: null }),
}));
vi.mock("./use-planning-task-controller", () => ({
  usePlanningTaskController: () => controller,
}));

describe("MatrixRouteScreen truncation", () => {
  it("turns application truncation into a reasoned partial route condition", () => {
    render(<MatrixRouteScreen hourCycle="12" projection={projection} />);

    expect(screen.getByTestId("matrix-condition")).toHaveTextContent("partial");
    expect(screen.getByText(/recurrence calculation/i)).toBeInTheDocument();
  });
});

const projection: EisenhowerProjection = {
  timeZone: "Asia/Singapore",
  nowAt: "2026-07-20T01:00:00.000Z",
  urgentThroughAt: "2026-07-21T01:00:00.000Z",
  doNow: [],
  plan: [],
  timeSensitive: [],
  later: [],
  truncated: true,
  truncationReasons: ["recurrence_series_candidate_limit"],
};
