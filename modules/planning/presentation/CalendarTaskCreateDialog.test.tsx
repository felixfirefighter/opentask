import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  online: true,
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/shared/presentation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOnlineStatus: () => mocks.online,
}));
vi.mock("./planning-client-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createPlanningTaskWithSchedule: mocks.create,
  listPlanningTaskLists: mocks.list,
}));

import { CalendarTaskCreateDialog } from "./CalendarTaskCreateDialog";

const inboxId = "ec586c89-acfc-4df5-ae9b-5a3ee1bb9599";
const resourceId = "464493d9-cf80-4db0-aafa-a032af988f85";
const listId = "1d55f6db-9936-47e8-acdf-28c9124bbf06";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.online = true;
  mocks.create.mockResolvedValue({ task: { id: resourceId }, schedule: { taskId: resourceId } });
  mocks.list.mockResolvedValue({ items: [{ id: listId, name: "Launch" }], nextCursor: null });
  vi.stubGlobal("crypto", { randomUUID: () => resourceId });
});

describe("CalendarTaskCreateDialog", () => {
  it("creates the seeded task and schedule through one atomic command", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreated = vi.fn();
    renderDialog(onClose, onCreated);

    await user.type(screen.getByLabelText("Task title"), "Prepare calendar demo");
    await user.type(screen.getByLabelText("Notes (Markdown)"), "## Run of show");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await user.selectOptions(
      screen.getByLabelText("List"),
      await screen.findByRole("option", { name: "Launch" }),
    );
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith(resourceId, {
      title: "Prepare calendar demo",
      descriptionMd: "## Run of show",
      priority: "high",
      listId,
      schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onCreated).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("creates a timed task from the same full form in the saved timezone", async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn());

    await user.type(screen.getByLabelText("Task title"), "Timed calendar review");
    await user.click(screen.getByRole("checkbox", { name: "All-day schedule" }));
    expect(screen.getByLabelText("Start")).toHaveValue("2026-07-20T09:00");
    expect(screen.getByLabelText("End")).toHaveValue("2026-07-20T10:00");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith(
      resourceId,
      expect.objectContaining({
        title: "Timed calendar review",
        schedule: {
          kind: "timed",
          startAt: "2026-07-20T01:00:00Z",
          endAt: "2026-07-20T02:00:00Z",
          timezone: "Asia/Singapore",
        },
      }),
    );
  });

  it("preserves every field and reuses the command id after an ambiguous failure", async () => {
    const user = userEvent.setup();
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    mocks.create.mockRejectedValueOnce(new TypeError("response lost")).mockResolvedValueOnce({
      task: { id: resourceId },
      schedule: { taskId: resourceId },
    });
    const onClose = vi.fn();
    renderDialog(onClose);
    const title = screen.getByLabelText("Task title");

    await user.type(title, "Keep this calendar draft");
    await user.type(screen.getByLabelText("Notes (Markdown)"), "Do not lose these notes");
    await user.selectOptions(screen.getByLabelText("Priority"), "medium");
    await user.selectOptions(
      screen.getByLabelText("List"),
      await screen.findByRole("option", { name: "Launch" }),
    );
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("every field is still here");
    expect(title).toHaveValue("Keep this calendar draft");
    expect(title).toBeDisabled();
    expect(screen.getByLabelText("Notes (Markdown)")).toHaveValue("Do not lose these notes");
    expect(screen.getByLabelText("Notes (Markdown)")).toBeDisabled();
    expect(screen.getByLabelText("Priority")).toHaveValue("medium");
    expect(screen.getByLabelText("List")).toHaveValue(listId);
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-07-20");
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls.some(([event]) => event.type === "opentask:workspace-data-changed")).toBe(
      true,
    );

    await user.click(screen.getByRole("button", { name: "Retry exact task" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[0]?.[0]).toBe(resourceId);
    expect(mocks.create.mock.calls[1]?.[0]).toBe(resourceId);
    expect(mocks.create.mock.calls[1]?.[1]).toEqual(mocks.create.mock.calls[0]?.[1]);
  });

  it("keeps the form readable but prevents creation while offline", () => {
    mocks.online = false;
    renderDialog(vi.fn());

    expect(screen.getByText("Reconnect to create this task.")).toBeInTheDocument();
    expect(screen.getByLabelText("Task title")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
  });

  it("refreshes authoritative views when confirmed close discards an unconfirmed create", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    const onClose = vi.fn();
    mocks.create.mockRejectedValueOnce(new TypeError("response lost"));
    renderDialog(onClose);

    await user.type(screen.getByLabelText("Task title"), "Possibly created calendar task");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Close task form" }));

    expect(confirm).toHaveBeenCalledWith(
      "The create outcome has not been confirmed. Closing discards the safe retry key. Close anyway?",
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls.some(([event]) => event.type === "opentask:workspace-data-changed")).toBe(
      true,
    );
  });

  it("keeps Inbox usable and can recover when regular-list loading fails", async () => {
    const user = userEvent.setup();
    mocks.list.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce({
      items: [{ id: listId, name: "Launch" }],
      nextCursor: null,
    });
    renderDialog(vi.fn());

    expect(await screen.findByRole("alert")).toHaveTextContent("Inbox remains available");
    expect(screen.getByRole("combobox", { name: "List" })).toHaveValue(inboxId);
    await user.click(screen.getByRole("button", { name: "Retry lists" }));

    expect(await screen.findByRole("option", { name: "Launch" })).toBeInTheDocument();
  });

  it("loads additional regular-list destinations without replacing earlier options", async () => {
    const user = userEvent.setup();
    const secondListId = "61667616-e80e-4593-969f-c822086fca1f";
    mocks.list
      .mockResolvedValueOnce({ items: [{ id: listId, name: "Launch" }], nextCursor: "next-page" })
      .mockResolvedValueOnce({
        items: [{ id: secondListId, name: "Personal" }],
        nextCursor: null,
      });
    renderDialog(vi.fn());

    await screen.findByRole("option", { name: "Launch" });
    await user.click(screen.getByRole("button", { name: "Load more lists" }));

    expect(await screen.findByRole("option", { name: "Personal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Launch" })).toBeInTheDocument();
  });

  it("cannot dismiss an in-flight command and lose its retry identity", async () => {
    const user = userEvent.setup();
    const request = deferred<{ task: { id: string }; schedule: { taskId: string } }>();
    mocks.create.mockReturnValueOnce(request.promise);
    const onClose = vi.fn();
    renderDialog(onClose);

    await user.type(screen.getByLabelText("Task title"), "Pending calendar command");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await screen.findByRole("button", { name: "Creating…" });
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Create scheduled task" })).toBeInTheDocument();
    expect(screen.getByLabelText("Task title")).toHaveValue("Pending calendar command");
    expect(onClose).not.toHaveBeenCalled();

    request.resolve({ task: { id: resourceId }, schedule: { taskId: resourceId } });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("warns before Escape discards a dirty calendar draft", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDialog(onClose);

    await user.type(screen.getByLabelText("Task title"), "Keep this draft");
    await user.keyboard("{Escape}");

    expect(confirm).toHaveBeenCalledWith("Discard this unsaved scheduled task draft?");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Task title")).toHaveValue("Keep this draft");

    confirm.mockReturnValue(true);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
});

function renderDialog(onClose: () => void, onCreated?: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarTaskCreateDialog
        inboxId={inboxId}
        inboxName="Inbox"
        initialDate="2026-07-20"
        open
        timeZone="Asia/Singapore"
        onClose={onClose}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
