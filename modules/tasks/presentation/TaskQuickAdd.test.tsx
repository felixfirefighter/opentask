import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  error: null as Error | null,
  isPending: false,
  isSuccess: false,
  mutateAsync: vi.fn(),
  online: true,
  reset: vi.fn(),
}));

vi.mock("@/shared/presentation", () => ({ useOnlineStatus: () => mocks.online }));
vi.mock("./data/use-task-editor-mutations", () => ({
  useCreateTaskMutation: () => ({
    error: mocks.error,
    isPending: mocks.isPending,
    isSuccess: mocks.isSuccess,
    mutateAsync: mocks.mutateAsync,
    reset: mocks.reset,
  }),
}));

import { TaskQuickAdd } from "./TaskQuickAdd";

describe("TaskQuickAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.error = null;
    mocks.isPending = false;
    mocks.isSuccess = false;
    mocks.online = true;
    mocks.mutateAsync.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000030" });
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000030" });
  });

  it("creates an unscheduled root task in the current list and clears only after success", async () => {
    const user = userEvent.setup();
    render(<TaskQuickAdd listId="00000000-0000-4000-8000-000000000020" listName="Inbox" />);

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
  });

  it("keeps the draft when creation fails and explains offline blocking", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValueOnce(new Error("network"));
    const { unmount } = render(
      <TaskQuickAdd listId="00000000-0000-4000-8000-000000000020" listName="Inbox" />,
    );
    const input = screen.getByLabelText("New task");
    await user.type(input, "Keep this title");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(input).toHaveValue("Keep this title");

    unmount();
    mocks.online = false;
    render(<TaskQuickAdd listId="00000000-0000-4000-8000-000000000020" listName="Inbox" />);
    expect(screen.getByText("Reconnect to add tasks.")).toBeInTheDocument();
    expect(screen.getByLabelText("New task")).toBeDisabled();
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
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({ id: "00000000-0000-4000-8000-000000000033" });

    render(<TaskQuickAdd listId="00000000-0000-4000-8000-000000000020" listName="Inbox" />);
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

    render(<TaskQuickAdd listId="00000000-0000-4000-8000-000000000020" listName="Inbox" />);
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
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue("");
    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
