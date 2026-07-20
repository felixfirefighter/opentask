import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FolderDto, RegularListDto } from "../application/contracts";

import { TaskNavigation } from "./TaskNavigation";

const organizerQueries = vi.hoisted(() => ({
  useFoldersQuery: vi.fn(),
  useRegularListsQuery: vi.fn(),
}));
const organizerMutations = vi.hoisted(() => ({
  useOrganizerMutations: vi.fn(),
}));

vi.mock("./data/use-organizer-queries", () => organizerQueries);
vi.mock("./data/use-organizer-mutations", () => organizerMutations);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const INBOX_ID = "52a8bc35-2a7e-44ea-84c1-626383effc70";
const FOLDER_ID = "f1c528b7-cfc6-4fe6-b5c2-9b536434a6fd";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const SECOND_LIST_ID = "667aaef1-f0bc-4b5d-bff2-ed6c33ad99b5";
let online = true;

const mutationActions = {
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveFolder: vi.fn(),
  deleteFolder: vi.fn(),
  createList: vi.fn(),
  renameList: vi.fn(),
  moveList: vi.fn(),
  deleteList: vi.fn(),
  isPending: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
  Object.values(mutationActions).forEach((action) => {
    if (typeof action === "function") action.mockResolvedValue(undefined);
  });
  organizerMutations.useOrganizerMutations.mockReturnValue(mutationActions);
  organizerQueries.useFoldersQuery.mockReturnValue(queryState([folder()]));
  organizerQueries.useRegularListsQuery.mockReturnValue(queryState([list(), secondList()]));
});

afterEach(() => vi.restoreAllMocks());

describe("TaskNavigation", () => {
  it("renders the implemented planning destinations and groups regular lists under folders", () => {
    render(<TaskNavigation current={{ listId: LIST_ID }} inboxId={INBOX_ID} />);

    const navigation = screen.getByRole("navigation", { name: "Task destinations" });
    expect(navigation).toBeInTheDocument();
    expect(navigation.parentElement).toHaveAttribute("data-context-navigation");
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
    expect(screen.getByRole("link", { name: "Completed / cancelled" })).toHaveAttribute("href", "/completed");
    expect(screen.getByRole("link", { name: "Launch" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Collapse folder Work" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/today");
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute("href", "/upcoming");
    expect(screen.getByRole("link", { name: "Priority matrix" })).toHaveAttribute("href", "/matrix");
    expect(screen.queryByRole("button", { name: /actions for.*Inbox/i })).not.toBeInTheDocument();
  });

  it("creates and renames organizers through labeled dialogs", async () => {
    const user = userEvent.setup();
    render(<TaskNavigation current="inbox" inboxId={INBOX_ID} />);

    await user.click(screen.getByRole("button", { name: "Create list" }));
    const createDialog = screen.getByRole("dialog", { name: "Create list" });
    await user.type(within(createDialog).getByLabelText("Name"), "Personal");
    await user.selectOptions(within(createDialog).getByLabelText("Folder"), FOLDER_ID);
    await user.selectOptions(within(createDialog).getByLabelText("Color"), "mint");
    await user.click(within(createDialog).getByRole("button", { name: "Create list" }));

    await waitFor(() =>
      expect(mutationActions.createList).toHaveBeenCalledWith({
        colorToken: "mint",
        folderId: FOLDER_ID,
        name: "Personal",
        resourceId: expect.any(String),
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Create list" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open actions for folder Work" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename folder" }));
    const renameDialog = screen.getByRole("dialog", { name: "Rename folder" });
    const name = within(renameDialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Studio");
    await user.click(within(renameDialog).getByRole("button", { name: "Rename folder" }));

    await waitFor(() =>
      expect(mutationActions.renameFolder).toHaveBeenCalledWith({ folder: folder(), name: "Studio" }),
    );
  });

  it("requires confirmation before delete and exposes menu reorder parity", async () => {
    const user = userEvent.setup();
    render(<TaskNavigation current="inbox" inboxId={INBOX_ID} />);

    await user.click(screen.getByRole("button", { name: "Open actions for list Launch" }));
    await user.click(screen.getByRole("menuitem", { name: "Move list down" }));
    expect(mutationActions.moveList).toHaveBeenCalledWith({
      folderId: FOLDER_ID,
      list: list(),
      placement: { kind: "after", anchorId: SECOND_LIST_ID },
    });

    await user.click(screen.getByRole("button", { name: "Open actions for list Launch" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete list…" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Delete list?" });
    expect(confirmation).toHaveTextContent("active tasks will move to Inbox");
    expect(mutationActions.deleteList).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "Delete list" }));
    await waitFor(() => expect(mutationActions.deleteList).toHaveBeenCalledWith(list()));
  });

  it("keeps links available but disables every write while offline", async () => {
    render(<TaskNavigation current="inbox" inboxId={INBOX_ID} />);

    online = false;
    act(() => window.dispatchEvent(new Event("offline")));

    expect(await screen.findByText("Navigation is read-only while offline.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("button", { name: "Create list" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reorder folder Work" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open actions for list Launch" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
  });

  it("keeps lists usable in a labeled fallback while folder details are loading", () => {
    organizerQueries.useFoldersQuery.mockReturnValue(queryState([], { isPending: true }));
    organizerQueries.useRegularListsQuery.mockReturnValue(queryState([list()]));

    render(<TaskNavigation current={{ listId: LIST_ID }} inboxId={INBOX_ID} />);

    expect(screen.getByRole("heading", { name: "Lists with unavailable folders" })).toBeInTheDocument();
    expect(
      screen.getByText("Folder details are still loading. Available lists remain below."),
    ).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "Launch" })).toHaveAttribute("href", `/lists/${LIST_ID}`);
    expect(screen.getByRole("button", { name: "Open actions for list Launch" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reorder list Launch" })).toBeDisabled();
  });

  it("retains fallback lists and retry when folder metadata fails without cache", async () => {
    const refetchFolders = vi.fn();
    const refetchLists = vi.fn();
    organizerQueries.useFoldersQuery.mockReturnValue(
      queryState([], { isError: true, refetch: refetchFolders }),
    );
    organizerQueries.useRegularListsQuery.mockReturnValue(queryState([list()], { refetch: refetchLists }));

    render(<TaskNavigation current="inbox" inboxId={INBOX_ID} />);

    expect(screen.getByRole("link", { name: "Launch" })).toBeInTheDocument();
    expect(
      screen.getByText("Some navigation could not be refreshed. Available lists remain below."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry navigation" }));
    expect(refetchFolders).toHaveBeenCalledOnce();
    expect(refetchLists).toHaveBeenCalledOnce();
  });

  it("shows stable loading, recoverable error, and compact drawer states", async () => {
    organizerQueries.useFoldersQuery.mockReturnValue(queryState([], { isPending: true }));
    organizerQueries.useRegularListsQuery.mockReturnValue(queryState([], { isPending: true }));
    const { rerender } = render(<TaskNavigation current="inbox" inboxId={INBOX_ID} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading task navigation");

    const refetchFolders = vi.fn();
    const refetchLists = vi.fn();
    organizerQueries.useFoldersQuery.mockReturnValue(
      queryState([], { isError: true, refetch: refetchFolders }),
    );
    organizerQueries.useRegularListsQuery.mockReturnValue(
      queryState([], { isError: true, refetch: refetchLists }),
    );
    rerender(<TaskNavigation current="inbox" inboxId={INBOX_ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry navigation" }));
    expect(refetchFolders).toHaveBeenCalled();
    expect(refetchLists).toHaveBeenCalled();

    organizerQueries.useFoldersQuery.mockReturnValue(queryState([folder()]));
    organizerQueries.useRegularListsQuery.mockReturnValue(queryState([list()]));
    rerender(<TaskNavigation current="inbox" inboxId={INBOX_ID} variant="compact" />);
    await userEvent.click(screen.getByRole("button", { name: "Open task navigation" }));
    expect(screen.getByRole("dialog", { name: "Tasks" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close task navigation" }));
    expect(screen.queryByRole("dialog", { name: "Tasks" })).not.toBeInTheDocument();
  });
});

function queryState<T>(items: T[], overrides: Record<string, unknown> = {}) {
  return {
    folders: items,
    lists: items,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function folder(): FolderDto {
  return {
    id: FOLDER_ID,
    name: "Work",
    rank: "a",
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}

function list(): RegularListDto {
  return {
    id: LIST_ID,
    folderId: FOLDER_ID,
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

function secondList(): RegularListDto {
  return { ...list(), id: SECOND_LIST_ID, name: "Personal", rank: "b" };
}
