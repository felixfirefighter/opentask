import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegularListDto, TaskSearchResultDto } from "../application/contracts";
import { TaskCommandPalette } from "./TaskCommandPalette";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  fetchMoreLists: vi.fn(),
  fetchMoreSearch: vi.fn(),
  lists: vi.fn(),
  mutateAsync: vi.fn(),
  online: vi.fn(),
  push: vi.fn(),
  refetchLists: vi.fn(),
  refetchSearch: vi.fn(),
  resetCreate: vi.fn(),
  search: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/shared/presentation", () => ({ useOnlineStatus: mocks.online }));
vi.mock("./data/use-organizer-queries", () => ({ useRegularListsQuery: mocks.lists }));
vi.mock("./data/use-task-editor-mutations", () => ({ useCreateTaskMutation: mocks.create }));
vi.mock("./data/use-task-queries", () => ({ useTaskSearchQuery: mocks.search }));

const INBOX_ID = "9a706f1c-b0c2-4432-b9b4-9b2f886ab2c2";
const LIST_ID = "58b64a31-f8b0-4d6c-852a-4baaa3672015";
const TASK_ID = "ec7ac8b7-cef9-4e60-a0b8-970252d73a6c";
const inbox = { id: INBOX_ID, name: "Inbox" };

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.online.mockReturnValue(true);
  mocks.lists.mockReturnValue(listQueryState());
  mocks.search.mockImplementation((query: string) => searchQueryState(query ? [] : []));
  mocks.mutateAsync.mockResolvedValue({ id: TASK_ID });
  mocks.create.mockReturnValue({
    error: null,
    isError: false,
    isPending: false,
    mutateAsync: mocks.mutateAsync,
    reset: mocks.resetCreate,
  });
});

describe("TaskCommandPalette", () => {
  it("opens with Mod+K and activates semantic destinations with the keyboard", async () => {
    const user = userEvent.setup();
    renderPalette();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(screen.getByRole("dialog", { name: "Search tasks and commands" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Inbox. Destination" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "Launch. List" })).toBeInTheDocument();

    await user.keyboard("{ArrowDown}{Enter}");

    expect(mocks.push).toHaveBeenCalledWith("/completed");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus after Escape and preserves a typed draft when closed", async () => {
    const user = userEvent.setup();
    renderPalette();
    const trigger = screen.getByRole("button", { name: /Search tasks and commands/u });

    await user.click(trigger);
    await user.type(searchInput(), "Draft follow-up");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(searchInput()).toHaveValue("Draft follow-up");
  });

  it("shows bounded task-search results with their type and list context", async () => {
    const user = userEvent.setup();
    mocks.search.mockImplementation((query: string) => searchQueryState(query ? [searchResult()] : []));
    renderPalette();

    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    await user.type(searchInput(), "Prepare");
    const result = screen.getByRole("option", {
      name: "Prepare demo. Task · Launch · Matched title, tag",
    });
    expect(mocks.search).toHaveBeenCalledWith("Prepare");

    await user.click(result);

    expect(mocks.push).toHaveBeenCalledWith(`/tasks/${TASK_ID}`);
  });

  it("quick-adds an unscheduled task to the explicit current list", async () => {
    const user = userEvent.setup();
    renderPalette(LIST_ID);
    const trigger = screen.getByRole("button", { name: /Search tasks and commands/u });

    await user.click(trigger);
    await user.type(searchInput(), "Draft demo notes");
    await user.click(screen.getByRole("option", { name: "Add “Draft demo notes”. Create task · Launch" }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledOnce());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      resourceId: expect.any(String),
      input: {
        title: "Draft demo notes",
        descriptionMd: "",
        priority: "none",
        listId: LIST_ID,
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "start" },
      },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Task added to Launch.");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("freezes a pending create and blocks overlapping create commands", async () => {
    const user = userEvent.setup();
    const request = deferred<{ id: string }>();
    mocks.mutateAsync.mockReturnValueOnce(request.promise);
    renderPalette(LIST_ID);

    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    const input = searchInput();
    await user.type(input, "Request A");
    const createOption = screen.getByRole("option", { name: "Add “Request A”. Create task · Launch" });
    mocks.resetCreate.mockClear();

    act(() => {
      createOption.click();
      createOption.click();
    });

    await waitFor(() => expect(input).toBeDisabled());
    fireEvent.change(input, { target: { value: "Later draft" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(mocks.resetCreate).not.toHaveBeenCalled();
    expect(input).toHaveValue("Request A");

    request.resolve({ id: TASK_ID });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(mocks.resetCreate).not.toHaveBeenCalled();
  });

  it("reuses the pending draft id after failure and rotates it after success", async () => {
    const user = userEvent.setup();
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("69b628eb-4937-45c2-a464-fcbfeac2dc46")
      .mockReturnValueOnce("ab1aa6ea-09d8-49d1-a8b6-a4391dc0e4fc");
    vi.stubGlobal("crypto", { randomUUID });
    mocks.mutateAsync
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValue({ id: TASK_ID });
    renderPalette(LIST_ID);

    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    await user.type(searchInput(), "Retry this task");
    await user.click(screen.getByRole("option", { name: /Add “Retry this task”/u }));
    await waitFor(() => expect(searchInput()).toBeEnabled());
    expect(searchInput()).toHaveValue("Retry this task");

    await user.click(screen.getByRole("option", { name: /Add “Retry this task”/u }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(mocks.mutateAsync.mock.calls[0]?.[0].resourceId).toBe("69b628eb-4937-45c2-a464-fcbfeac2dc46");
    expect(mocks.mutateAsync.mock.calls[1]?.[0].resourceId).toBe("69b628eb-4937-45c2-a464-fcbfeac2dc46");

    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    await user.type(searchInput(), "New task");
    await user.click(screen.getByRole("option", { name: /Add “New task”/u }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(3));
    expect(mocks.mutateAsync.mock.calls[2]?.[0].resourceId).toBe("ab1aa6ea-09d8-49d1-a8b6-a4391dc0e4fc");
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("falls back to Inbox when no current list is supplied", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    await user.type(searchInput(), "Capture thought");
    await user.click(screen.getByRole("option", { name: "Add “Capture thought”. Create task · Inbox" }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ listId: INBOX_ID }) }),
      ),
    );
  });

  it("keeps navigation available offline while disabling search and create", async () => {
    const user = userEvent.setup();
    mocks.online.mockReturnValue(false);
    renderPalette();

    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));

    expect(
      screen.getByText("Search and quick add need a connection. Destinations still work."),
    ).toHaveAttribute("role", "status");
    expect(searchInput()).toBeDisabled();
    expect(mocks.search).toHaveBeenLastCalledWith("");
    expect(screen.queryByRole("group", { name: "Create" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Inbox. Destination" }));
    expect(mocks.push).toHaveBeenCalledWith("/inbox");
  });

  it("names the search loading state", async () => {
    const user = userEvent.setup();
    mocks.search.mockReturnValue(searchQueryState([], { isPending: true }));
    renderPalette();
    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    await user.type(searchInput(), "Missing");
    expect(screen.getByText("Searching tasks…")).toHaveAttribute("role", "status");
  });

  it("keeps the list-loading status outside the command listbox", async () => {
    const user = userEvent.setup();
    mocks.lists.mockReturnValue({ ...listQueryState(), lists: [], isPending: true });
    renderPalette();

    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));

    const listbox = screen.getByRole("listbox", { name: "Commands and task results" });
    const loadingStatus = screen.getByText("Loading lists…");
    expect(loadingStatus).toHaveAttribute("role", "status");
    expect(listbox).not.toContainElement(loadingStatus);
    expect(within(listbox).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("names an empty task search while preserving the create path", async () => {
    const user = userEvent.setup();
    mocks.search.mockReturnValue(searchQueryState([]));
    renderPalette();
    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    await user.type(searchInput(), "Missing");
    expect(screen.getByText("No matching tasks. You can add this title instead.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("option", { name: /Add “Missing”/u })).toBeInTheDocument();
  });

  it("names a search error and offers an explicit retry", async () => {
    const user = userEvent.setup();
    mocks.search.mockReturnValue(searchQueryState([], { isError: true }));
    renderPalette();
    await user.click(screen.getByRole("button", { name: /Search tasks and commands/u }));
    await user.type(searchInput(), "Missing");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Task search could not be loaded.");
    expect(mocks.refetchSearch).toHaveBeenCalledOnce();
  });
});

function renderPalette(currentListId?: string) {
  return render(<TaskCommandPalette inbox={inbox} {...(currentListId ? { currentListId } : {})} />);
}

function searchInput() {
  return screen.getByRole("combobox", { name: "Search tasks and commands" });
}

function listQueryState() {
  return {
    lists: [regularList()],
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mocks.fetchMoreLists,
    refetch: mocks.refetchLists,
  };
}

function searchQueryState(
  results: TaskSearchResultDto[],
  override: Partial<{ isPending: boolean; isError: boolean }> = {},
) {
  return {
    results,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mocks.fetchMoreSearch,
    refetch: mocks.refetchSearch,
    ...override,
  };
}

function regularList(): RegularListDto {
  return {
    id: LIST_ID,
    folderId: null,
    name: "Launch",
    colorToken: "coral",
    rank: "a",
    kind: "regular",
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}

function searchResult(): TaskSearchResultDto {
  return {
    task: {
      id: TASK_ID,
      listId: LIST_ID,
      sectionId: null,
      parentTaskId: null,
      title: "Prepare demo",
      descriptionMd: "Checklist and launch notes",
      status: "open",
      priority: "high",
      rank: "a",
      statusChangedAt: "2026-07-19T00:00:00.000Z",
      version: 1,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
      deletedAt: null,
    },
    list: { id: LIST_ID, name: "Launch" },
    matchedFields: ["title", "tag"],
    matchingTags: [
      {
        id: "bced7951-b1fd-4edb-ad2d-f2bacd5e7355",
        name: "demo",
        colorToken: "mint",
        version: 1,
        createdAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
        deletedAt: null,
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
