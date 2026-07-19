import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TodayProjection } from "../application/public";

import { TodayRouteScreen } from "./TodayRouteScreen";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  parseQuickAdd: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  setSchedule: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("./planning-client-api", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    createPlanningTask: mocks.createTask,
    parsePlanningQuickAdd: mocks.parseQuickAdd,
    setPlanningTaskSchedule: mocks.setSchedule,
  };
});

const INBOX_ID = "09d7cb40-9c45-43fc-bb2a-0fa62e920d96";
const TASK_ID = "352493c8-1e29-4dc1-bde7-bffac1c190d2";
const projection: TodayProjection = {
  localDate: "2026-07-20",
  timeZone: "Asia/Singapore",
  nowAt: "2026-07-20T01:00:00.000Z",
  overdue: [],
  timed: [],
  anytime: [],
  remainingCount: 0,
  truncated: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTask.mockResolvedValue({ id: TASK_ID, version: 1 });
  mocks.setSchedule.mockResolvedValue({ task: { id: TASK_ID, version: 2 }, schedule: null });
  mocks.parseQuickAdd.mockImplementation((sourceText: string) =>
    Promise.resolve({
      sourceText,
      suggestions: [
        {
          recognizedText: "tomorrow at 3pm",
          startIndex: 9,
          endIndex: 24,
          schedule: {
            kind: "timed",
            startAt: "2026-07-21T07:00:00.000Z",
            endAt: "2026-07-21T07:00:00.000Z",
            timezone: "Asia/Singapore",
          },
          warnings: [],
        },
      ],
    }),
  );
});

describe("TodayRouteScreen quick add", () => {
  it("edits a recognized schedule before save without changing the source title", async () => {
    const user = userEvent.setup();
    render(<TodayRouteScreen hourCycle="12" inboxId={INBOX_ID} projection={projection} />);

    const input = screen.getByRole("textbox", { name: "Add a task" });
    await user.type(input, "Call Sam tomorrow at 3pm");
    const edit = await screen.findByRole("button", {
      name: "Edit recognized value tomorrow at 3pm",
    });
    await user.click(edit);

    expect(screen.getByRole("dialog", { name: "Edit schedule" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-07-21T16:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-07-21T17:00" } });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(input).toHaveValue("Call Sam tomorrow at 3pm");
    expect(
      screen.getByRole("button", {
        name: /Edit recognized value tomorrow at 3pm · Jul 21, 4:00 PM–5:00 PM/u,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() =>
      expect(mocks.setSchedule).toHaveBeenCalledWith(TASK_ID, 1, {
        kind: "timed",
        startAt: "2026-07-21T08:00:00Z",
        endAt: "2026-07-21T09:00:00Z",
        timezone: "Asia/Singapore",
      }),
    );
    expect(mocks.createTask).toHaveBeenCalledWith(expect.any(String), {
      title: "Call Sam tomorrow at 3pm",
      listId: INBOX_ID,
    });
  });
});
