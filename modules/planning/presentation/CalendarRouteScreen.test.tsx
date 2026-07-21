import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarProjection } from "../application/public";
import { CalendarRouteScreen } from "./CalendarRouteScreen";
import type { PlanningOccurrenceMutationResult } from "./planning-client-api";
import type { MutablePlanningTask } from "./use-planning-task-controller";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const controllerHook = vi.hoisted(() => vi.fn());
const controller = vi.hoisted(() => ({
  announcement: "",
  closeSchedule: vi.fn(),
  condition: { kind: "ready" } as const,
  conflictedTaskId: null,
  editSchedule: vi.fn(),
  retry: vi.fn(),
  saveCalendarChange: vi.fn(),
  saveSchedule: vi.fn(),
  scheduleTask: null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./CalendarScreen", () => ({
  CalendarScreen: ({
    condition,
    onAddTask,
    onEditSchedule,
  }: {
    condition: { kind: string };
    onAddTask: () => void;
    onEditSchedule: (taskId: string) => void;
  }) => (
    <>
      <span data-testid="calendar-condition">{condition.kind}</span>
      <button type="button" disabled={condition.kind === "partial"} onClick={onAddTask}>
        Add task
      </button>
      <button type="button" onClick={() => onEditSchedule("task-demo")}>
        Edit schedule
      </button>
    </>
  ),
}));
vi.mock("./CalendarTaskCreateDialog", () => ({
  CalendarTaskCreateDialog: ({
    onClose,
    onCreated,
    open,
  }: {
    onClose: () => void;
    onCreated?: () => void;
    open: boolean;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onCreated?.();
          onClose();
        }}
      >
        Complete create
      </button>
    ) : null,
}));
vi.mock("./ScheduleEditorDialog", () => ({
  ScheduleEditorDialog: ({
    onSave,
  }: {
    onSave: (
      taskId: string,
      schedule: { kind: "all_day"; startDate: string; endDate: string },
    ) => Promise<unknown>;
  }) => (
    <button
      type="button"
      onClick={() =>
        void onSave("task-demo", {
          kind: "all_day",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
        })
      }
    >
      Save schedule test
    </button>
  ),
}));
vi.mock("./use-planning-task-controller", () => ({
  usePlanningTaskController: (...args: unknown[]) => {
    controllerHook(...args);
    return controller;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  controller.saveSchedule.mockResolvedValue("saved");
});

describe("CalendarRouteScreen announcements", () => {
  it("turns application truncation into a partial route condition", () => {
    render(
      <CalendarRouteScreen
        hasSavedView={false}
        hourCycle="12"
        inboxId="09d7cb40-9c45-43fc-bb2a-0fa62e920d96"
        inboxName="Inbox"
        initialDate="2026-07-20"
        projection={{
          ...projection,
          truncated: true,
          truncationReasons: ["recurrence_output_limit"],
        }}
        view="month"
        weekStartsOn={1}
      />,
    );

    expect(screen.getByTestId("calendar-condition")).toHaveTextContent("partial");
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
  });

  it("clears repeated create-success text before announcing the next identical success", async () => {
    const user = userEvent.setup();
    render(
      <CalendarRouteScreen
        hasSavedView={false}
        hourCycle="12"
        inboxId="09d7cb40-9c45-43fc-bb2a-0fa62e920d96"
        inboxName="Inbox"
        initialDate="2026-07-20"
        projection={projection}
        view="month"
        weekStartsOn={1}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(screen.getByRole("button", { name: "Complete create" }));
    expect(screen.getByRole("status")).toHaveTextContent("Scheduled task created.");

    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "Complete create" }));
    expect(screen.getByRole("status")).toHaveTextContent("Scheduled task created.");
  });

  it("owns schedule-dialog focus while disabling generic controller focus restoration", async () => {
    const user = userEvent.setup();
    render(
      <CalendarRouteScreen
        hasSavedView={false}
        hourCycle="12"
        inboxId="09d7cb40-9c45-43fc-bb2a-0fa62e920d96"
        inboxName="Inbox"
        initialDate="2026-07-20"
        projection={projection}
        view="month"
        weekStartsOn={1}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Edit schedule" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Save schedule test" }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(controller.saveSchedule).toHaveBeenCalledWith(
      "task-demo",
      { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      false,
    );
  });

  it("keeps optimistic Calendar state separate from the authoritative version fence", async () => {
    render(
      <CalendarRouteScreen
        hasSavedView={false}
        hourCycle="12"
        inboxId="09d7cb40-9c45-43fc-bb2a-0fa62e920d96"
        inboxName="Inbox"
        initialDate="2026-07-20"
        projection={recurringProjection}
        view="month"
        weekStartsOn={1}
      />,
    );

    const initialCall = controllerHook.mock.calls.at(-1);
    expect((initialCall?.[0] as MutablePlanningTask[])[0]?.version).toBe(3);
    const options = initialCall?.[2] as {
      onOccurrenceApplied: (result: PlanningOccurrenceMutationResult) => void;
    };

    act(() => options.onOccurrenceApplied(occurrenceResult));

    await waitFor(() => expect(controllerHook).toHaveBeenCalledTimes(2));
    const refreshedCall = controllerHook.mock.calls.at(-1);
    expect((refreshedCall?.[0] as MutablePlanningTask[])[0]?.version).toBe(3);
    expect(refreshedCall?.[2]).toMatchObject({ authoritativeSource: recurringProjection });
  });
});

const projection: CalendarProjection = {
  rangeStartDate: "2026-07-01",
  rangeEndDate: "2026-08-01",
  rangeStartAt: "2026-06-30T16:00:00.000Z",
  rangeEndAt: "2026-07-31T16:00:00.000Z",
  timeZone: "Asia/Singapore",
  events: [],
  truncated: false,
  truncationReasons: [],
};

const recurringTaskId = "352493c8-1e29-4dc1-bde7-bffac1c190d2";
const recurringProjection: CalendarProjection = {
  ...projection,
  events: [
    {
      projectionId: `occurrence:${recurringTaskId}:occurrence-key`,
      taskId: recurringTaskId,
      title: "Review progress",
      status: "open",
      priority: "none",
      listId: "09d7cb40-9c45-43fc-bb2a-0fa62e920d96",
      version: 3,
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      projectionLifecycle: "recurring_occurrence",
      occurrenceKey: "occurrence-key",
      occurrenceState: "completed",
      transitionEligible: true,
      recurrenceSummary: "Every day",
      scheduleInteraction: {
        editScope: "series",
        dragEnabled: false,
        dragDisabledReason: "Recurring occurrences use the series editor.",
      },
    },
  ],
};
const occurrenceResult: PlanningOccurrenceMutationResult = {
  outcome: "applied",
  action: "undo",
  occurrenceKey: "occurrence-key",
  expectedVersion: 3,
  task: { id: recurringTaskId, version: 4 },
  occurrenceState: "open",
  eventTaskVersion: 4,
};
