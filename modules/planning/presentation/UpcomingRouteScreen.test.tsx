import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpcomingProjection } from "../application/public";
import { UpcomingRouteScreen } from "./UpcomingRouteScreen";

const mocks = vi.hoisted(() => ({
  createTaskWithSchedule: vi.fn(),
  parseQuickAdd: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("./planning-client-api", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    createPlanningTaskWithSchedule: mocks.createTaskWithSchedule,
    parsePlanningQuickAdd: mocks.parseQuickAdd,
  };
});

const INBOX_ID = "09d7cb40-9c45-43fc-bb2a-0fa62e920d96";
const projection: UpcomingProjection = {
  rangeStartDate: "2026-07-20",
  rangeEndDate: "2026-07-27",
  timeZone: "Asia/Singapore",
  nowAt: "2026-07-20T01:00:00.000Z",
  days: Array.from({ length: 7 }, (_, offset) => ({
    localDate: `2026-07-${String(20 + offset).padStart(2, "0")}`,
    items: [],
  })),
  remainingCount: 0,
  truncated: false,
  truncationReasons: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTaskWithSchedule.mockResolvedValue({
    task: { id: "352493c8-1e29-4dc1-bde7-bffac1c190d2", version: 1 },
    schedule: { taskId: "352493c8-1e29-4dc1-bde7-bffac1c190d2" },
  });
  mocks.parseQuickAdd.mockImplementation((sourceText: string) =>
    Promise.resolve({ sourceText, suggestions: [] }),
  );
});

describe("UpcomingRouteScreen quick add", () => {
  it("turns application truncation into an explicit read-only partial route", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UpcomingRouteScreen
          hourCycle="12"
          inboxId={INBOX_ID}
          projection={{
            ...projection,
            truncated: true,
            truncationReasons: ["recurrence_event_source_limit"],
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("This planning view is incomplete");
    expect(screen.getByRole("alert")).toHaveTextContent("recurrence history loading");
    expect(screen.getByRole("textbox", { name: "Add a task" })).toBeDisabled();
  });

  it("uses the next local day when no date is recognized", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UpcomingRouteScreen hourCycle="12" inboxId={INBOX_ID} projection={projection} />
      </QueryClientProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Add a task" });
    await user.type(input, "Prepare the handoff");
    await waitFor(() => expect(mocks.parseQuickAdd).toHaveBeenCalledOnce());
    const form = input.closest("form");
    if (!form) throw new Error("Upcoming quick add form was not rendered");
    await user.click(within(form).getByRole("button", { name: "Add task" }));

    await waitFor(() =>
      expect(mocks.createTaskWithSchedule).toHaveBeenCalledWith(expect.any(String), {
        title: "Prepare the handoff",
        listId: INBOX_ID,
        schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
      }),
    );
    expect(await screen.findByText("Task added to Upcoming.")).toBeInTheDocument();
  });
});
