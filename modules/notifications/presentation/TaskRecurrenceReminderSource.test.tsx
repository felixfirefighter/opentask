import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
    isFetching: false,
    isPending: false,
    isSuccess: true,
    refetch: vi.fn(async () => undefined),
  },
}));

vi.mock("./data/use-notification-queries", () => ({
  useTaskReminderQuery: () => mocks.query,
}));

import { TaskRecurrenceReminderSource } from "./TaskRecurrenceReminderSource";

describe("TaskRecurrenceReminderSource", () => {
  beforeEach(() => {
    mocks.query.data = null;
    mocks.query.isFetching = false;
    mocks.query.isPending = false;
    mocks.query.isSuccess = true;
    mocks.query.refetch.mockClear();
  });

  it("exposes only the version of an absolute reminder", () => {
    mocks.query.data = {
      version: 4,
      spec: { kind: "absolute", remindAt: "2099-07-21T01:00:00.000Z", offsetMinutes: null },
    };

    render(
      <TaskRecurrenceReminderSource taskId="00000000-0000-4000-8000-000000000010">
        {(review) => <output>{`${review.status}:${review.absoluteReminderVersion ?? "none"}`}</output>}
      </TaskRecurrenceReminderSource>,
    );

    expect(screen.getByText("ready:4")).toBeInTheDocument();
  });

  it("does not ask recurrence to review a relative reminder", () => {
    mocks.query.data = {
      version: 5,
      spec: { kind: "relative_start", remindAt: null, offsetMinutes: 15 },
    };

    render(
      <TaskRecurrenceReminderSource taskId="00000000-0000-4000-8000-000000000010">
        {(review) => <output>{`${review.status}:${review.absoluteReminderVersion ?? "none"}`}</output>}
      </TaskRecurrenceReminderSource>,
    );

    expect(screen.getByText("ready:none")).toBeInTheDocument();
  });

  it("blocks the gate while loading and exposes an explicit refresh", async () => {
    const user = userEvent.setup();
    mocks.query.isFetching = true;

    const view = render(
      <TaskRecurrenceReminderSource taskId="00000000-0000-4000-8000-000000000010">
        {(review) => (
          <button type="button" onClick={() => void review.refresh()}>
            {review.status}
          </button>
        )}
      </TaskRecurrenceReminderSource>,
    );

    await user.click(screen.getByRole("button", { name: "loading" }));
    expect(mocks.query.refetch).toHaveBeenCalledOnce();

    mocks.query.isFetching = false;
    mocks.query.isSuccess = false;
    mocks.query.data = undefined;
    view.rerender(
      <TaskRecurrenceReminderSource taskId="00000000-0000-4000-8000-000000000010">
        {(review) => <output>{review.status}</output>}
      </TaskRecurrenceReminderSource>,
    );
    expect(screen.getByText("unavailable")).toBeInTheDocument();
  });
});
