import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  error: null as Error | null,
  isPending: false,
  isSuccess: false,
  mutateAsync: vi.fn(),
  scheduledError: null as Error | null,
  scheduledIsPending: false,
  scheduledIsSuccess: false,
  scheduledMutateAsync: vi.fn(),
  scheduledReset: vi.fn(),
  guard: vi.fn(),
  parseQuickAdd: vi.fn(),
  online: true,
  reset: vi.fn(),
}));

vi.mock("@/shared/presentation", () => ({
  useOnlineStatus: () => mocks.online,
  useUnsavedNavigationGuard: mocks.guard,
}));
vi.mock("./data/use-task-editor-mutations", () => ({
  useCreateTaskMutation: () => ({
    error: mocks.error,
    isPending: mocks.isPending,
    isSuccess: mocks.isSuccess,
    mutateAsync: mocks.mutateAsync,
    reset: mocks.reset,
  }),
  useCreateTaskWithScheduleMutation: () => ({
    error: mocks.scheduledError,
    isPending: mocks.scheduledIsPending,
    isSuccess: mocks.scheduledIsSuccess,
    mutateAsync: mocks.scheduledMutateAsync,
    reset: mocks.scheduledReset,
  }),
}));
vi.mock("./data/task-api-client", () => ({ parseQuickAdd: mocks.parseQuickAdd }));

import { TaskQuickAdd } from "./TaskQuickAdd";
import { TaskApiError } from "./data/task-api-request";

const quickAddProps = {
  hourCycle: "h23" as const,
  listId: "00000000-0000-4000-8000-000000000020",
  listName: "Inbox",
  timeZone: "Asia/Singapore",
};

describe("TaskQuickAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.error = null;
    mocks.isPending = false;
    mocks.isSuccess = false;
    mocks.scheduledError = null;
    mocks.scheduledIsPending = false;
    mocks.scheduledIsSuccess = false;
    mocks.online = true;
    mocks.mutateAsync.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000030" });
    mocks.scheduledMutateAsync.mockResolvedValue({
      task: { id: "00000000-0000-4000-8000-000000000030" },
      schedule: { taskId: "00000000-0000-4000-8000-000000000030" },
    });
    mocks.parseQuickAdd.mockImplementation((text: string) =>
      Promise.resolve({ sourceText: text, suggestions: [] }),
    );
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000030" });
  });

  it("creates an unscheduled root task in the current list and clears only after success", async () => {
    const user = userEvent.setup();
    render(<TaskQuickAdd {...quickAddProps} />);

    const input = screen.getByLabelText("New task");
    await user.type(input, "  Prepare demo  ");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledOnce());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      resourceId: "00000000-0000-4000-8000-000000000030",
      input: {
        title: "Prepare demo",
        descriptionMd: "",
        priority: "none",
        listId: "00000000-0000-4000-8000-000000000020",
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "start" },
      },
    });
    expect(input).toHaveValue("");
    expect(await screen.findByText("Task added.")).toBeInTheDocument();
  });

  it("shows one recognized schedule and creates the task and schedule in one command", async () => {
    const user = userEvent.setup();
    mocks.parseQuickAdd.mockImplementation((text: string) =>
      Promise.resolve({
        sourceText: text,
        suggestions: [
          {
            recognizedText: "tomorrow",
            startIndex: 12,
            endIndex: 20,
            schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
            warnings: [],
          },
        ],
      }),
    );
    render(<TaskQuickAdd {...quickAddProps} />);

    await user.type(screen.getByLabelText("New task"), "Review demo tomorrow");
    expect(await screen.findByRole("button", { name: "Edit recognized value tomorrow" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(mocks.scheduledMutateAsync).toHaveBeenCalledOnce());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.scheduledMutateAsync).toHaveBeenCalledWith({
      resourceId: "00000000-0000-4000-8000-000000000030",
      input: {
        title: "Review demo tomorrow",
        descriptionMd: "",
        priority: "none",
        listId: "00000000-0000-4000-8000-000000000020",
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "start" },
        schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
      },
    });
  });

  it("ignores stale parse responses and keeps a recognized draft across reconnect", async () => {
    const first = deferred<ReturnType<typeof parseResult>>();
    const second = deferred<ReturnType<typeof parseResult>>();
    mocks.parseQuickAdd.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");

    fireEvent.change(input, { target: { value: "First tomorrow" } });
    await waitFor(() => expect(mocks.parseQuickAdd).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "Second Friday" } });
    await waitFor(() => expect(mocks.parseQuickAdd).toHaveBeenCalledTimes(2));
    second.resolve(parseResult("Second Friday", "Friday", "2026-07-24"));
    expect(await screen.findByRole("button", { name: "Edit recognized value Friday" })).toBeInTheDocument();
    first.resolve(parseResult("First tomorrow", "tomorrow", "2026-07-21"));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Edit recognized value tomorrow" }),
      ).not.toBeInTheDocument(),
    );

    mocks.online = false;
    rerender(<TaskQuickAdd {...quickAddProps} />);
    expect(screen.getByRole("button", { name: "Edit recognized value Friday" })).toBeDisabled();
    mocks.online = true;
    rerender(<TaskQuickAdd {...quickAddProps} />);
    expect(screen.getByRole("button", { name: "Edit recognized value Friday" })).toBeEnabled();
    expect(mocks.parseQuickAdd).toHaveBeenCalledTimes(2);
  });

  it("clears a recognized schedule before clearing the task text with Escape", async () => {
    const user = userEvent.setup();
    mocks.parseQuickAdd.mockImplementation((text: string) =>
      Promise.resolve(parseResult(text, "tomorrow", "2026-07-21")),
    );
    render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");

    await user.type(input, "Keep this title tomorrow");
    await screen.findByRole("button", { name: "Edit recognized value tomorrow" });
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("Keep this title tomorrow");
    expect(screen.queryByRole("button", { name: /Edit recognized value/u })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("keeps the draft when creation fails and explains offline blocking", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValueOnce(new Error("network"));
    const { unmount } = render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");
    await user.type(input, "Keep this title");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(input).toHaveValue("Keep this title");

    unmount();
    mocks.online = false;
    render(<TaskQuickAdd {...quickAddProps} />);
    expect(screen.getByText("Reconnect to add tasks.")).toBeInTheDocument();
    expect(screen.getByLabelText("New task")).toBeDisabled();
  });

  it("clears the exact-retry draft when confirmed navigation discards an unconfirmed create", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValueOnce(new TypeError("response lost"));
    render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");

    await user.type(input, "Possibly created task");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(input).toBeDisabled());

    const discard = mocks.guard.mock.lastCall?.[2] as (() => void) | undefined;
    expect(typeof discard).toBe("function");
    act(() => discard?.());

    expect(input).toHaveValue("");
    expect(input).toBeEnabled();
    expect(mocks.reset).toHaveBeenCalled();
  });

  it("reuses an idempotency key for an ambiguous retry and resets it after success or an input change", async () => {
    const user = userEvent.setup();
    const resourceIds = [
      "00000000-0000-4000-8000-000000000031",
      "00000000-0000-4000-8000-000000000032",
      "00000000-0000-4000-8000-000000000033",
    ];
    const randomUUID = vi.fn(() => resourceIds.shift());
    vi.stubGlobal("crypto", { randomUUID });
    mocks.mutateAsync
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({ id: "00000000-0000-4000-8000-000000000031" })
      .mockRejectedValueOnce(
        new TaskApiError({ code: "VALIDATION_FAILED", status: 400, detail: "Invalid title" }),
      )
      .mockResolvedValueOnce({ id: "00000000-0000-4000-8000-000000000033" });

    render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");
    const submit = screen.getByRole("button", { name: "Add task" });

    await user.type(input, "Prepare demo");
    await user.click(submit);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("Prepare demo");

    await user.click(submit);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mocks.mutateAsync.mock.calls[0]?.[0].resourceId).toBe("00000000-0000-4000-8000-000000000031");
    expect(mocks.mutateAsync.mock.calls[1]?.[0].resourceId).toBe("00000000-0000-4000-8000-000000000031");
    expect(input).toHaveValue("");

    await user.type(input, "Write release notes");
    await user.click(submit);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(3));
    expect(mocks.mutateAsync.mock.calls[2]?.[0].resourceId).toBe("00000000-0000-4000-8000-000000000032");
    expect(input).toHaveValue("Write release notes");

    await user.type(input, " today");
    await user.click(submit);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(4));
    expect(mocks.mutateAsync.mock.calls[3]?.[0].resourceId).toBe("00000000-0000-4000-8000-000000000033");
    expect(randomUUID).toHaveBeenCalledTimes(3);
  });

  it("freezes the submitted draft and blocks overlapping creates until the request settles", async () => {
    const user = userEvent.setup();
    const request = deferred<{ id: string }>();
    mocks.mutateAsync.mockReturnValueOnce(request.promise);

    render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");
    const form = input.closest("form");
    if (!form) throw new Error("Quick add form was not rendered");

    await user.type(input, "Request A");
    mocks.reset.mockClear();
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(input).toBeDisabled());
    fireEvent.change(input, { target: { value: "Later draft" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(input).toHaveValue("Request A");

    request.resolve({ id: "00000000-0000-4000-8000-000000000030" });
    await waitFor(() => expect(input).toBeDisabled());
    expect(input).toHaveValue("");
    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(mocks.reset).toHaveBeenCalledOnce();
  });

  it("keeps the submitted command and idempotency key when parsing resolves during an ambiguous create", async () => {
    const user = userEvent.setup();
    const parse = deferred<ReturnType<typeof parseResult>>();
    const request = deferred<{ id: string }>();
    const randomUUID = vi.fn(() => "00000000-0000-4000-8000-000000000034");
    vi.stubGlobal("crypto", { randomUUID });
    mocks.parseQuickAdd.mockReturnValueOnce(parse.promise);
    mocks.mutateAsync
      .mockReturnValueOnce(request.promise)
      .mockResolvedValueOnce({ id: "00000000-0000-4000-8000-000000000034" });

    const view = render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");
    const submit = screen.getByRole("button", { name: "Add task" });
    await user.type(input, "Review tomorrow");
    await waitFor(() => expect(mocks.parseQuickAdd).toHaveBeenCalledOnce());

    await user.click(submit);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledOnce());
    parse.resolve(parseResult("Review tomorrow", "tomorrow", "2026-07-21"));
    request.reject(new TypeError("response lost"));

    await waitFor(() => expect(input).toBeDisabled());
    expect(input).toHaveValue("Review tomorrow");
    expect(screen.queryByRole("button", { name: /Edit recognized value/u })).not.toBeInTheDocument();
    expect(mocks.guard.mock.lastCall?.slice(0, 2)).toEqual([true, expect.stringContaining("safe retry key")]);
    expect(typeof mocks.guard.mock.lastCall?.[2]).toBe("function");

    view.rerender(
      <TaskQuickAdd
        {...quickAddProps}
        listId="00000000-0000-4000-8000-000000000099"
        timeZone="America/New_York"
      />,
    );

    await user.click(submit);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mocks.scheduledMutateAsync).not.toHaveBeenCalled();
    expect(mocks.mutateAsync.mock.calls[0]?.[0].resourceId).toBe("00000000-0000-4000-8000-000000000034");
    expect(mocks.mutateAsync.mock.calls[1]?.[0].resourceId).toBe("00000000-0000-4000-8000-000000000034");
    expect(mocks.mutateAsync.mock.calls[1]?.[0]).toEqual(mocks.mutateAsync.mock.calls[0]?.[0]);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("reinterprets an unchanged title after the saved timezone changes", async () => {
    const user = userEvent.setup();
    mocks.parseQuickAdd.mockImplementation((text: string, timeZone: string) =>
      Promise.resolve(
        parseResult(
          text,
          timeZone === "Asia/Singapore" ? "tomorrow SGT" : "tomorrow NY",
          timeZone === "Asia/Singapore" ? "2026-07-21" : "2026-07-20",
        ),
      ),
    );
    const view = render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");
    await user.type(input, "Meet tomorrow SGT NY");
    await screen.findByRole("button", { name: "Edit recognized value tomorrow SGT" });

    view.rerender(<TaskQuickAdd {...quickAddProps} timeZone="America/New_York" />);

    expect(
      await screen.findByRole("button", { name: "Edit recognized value tomorrow NY" }),
    ).toBeInTheDocument();
    expect(mocks.parseQuickAdd).toHaveBeenCalledTimes(2);
  });

  it("does not submit a suggestion parsed for the previous timezone while reparsing", async () => {
    const user = userEvent.setup();
    const reparsed = deferred<ReturnType<typeof parseResult>>();
    mocks.parseQuickAdd
      .mockResolvedValueOnce(parseResult("Meet tomorrow", "tomorrow", "2026-07-21"))
      .mockReturnValueOnce(reparsed.promise);
    const view = render(<TaskQuickAdd {...quickAddProps} />);
    const input = screen.getByLabelText("New task");
    await user.type(input, "Meet tomorrow");
    await screen.findByRole("button", { name: "Edit recognized value tomorrow" });

    view.rerender(<TaskQuickAdd {...quickAddProps} timeZone="America/New_York" />);

    expect(screen.queryByRole("button", { name: /Edit recognized value/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledOnce());
    expect(mocks.scheduledMutateAsync).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function parseResult(sourceText: string, recognizedText: string, startDate: string) {
  const end = new Date(`${startDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    sourceText,
    suggestions: [
      {
        recognizedText,
        startIndex: sourceText.indexOf(recognizedText),
        endIndex: sourceText.indexOf(recognizedText) + recognizedText.length,
        schedule: { kind: "all_day" as const, startDate, endDate: end.toISOString().slice(0, 10) },
        warnings: [] as const,
      },
    ],
  };
}
