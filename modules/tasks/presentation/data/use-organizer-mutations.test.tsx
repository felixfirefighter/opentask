import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FolderDto, RegularListDto } from "../../application/contracts";

import { TaskApiError } from "./task-api-request";
import { useOrganizerMutations } from "./use-organizer-mutations";

const organizerApi = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createRegularList: vi.fn(),
  deleteFolder: vi.fn(),
  deleteRegularList: vi.fn(),
  getFolder: vi.fn(),
  getRegularList: vi.fn(),
  moveRegularList: vi.fn(),
  positionFolder: vi.fn(),
  restoreFolder: vi.fn(),
  restoreRegularList: vi.fn(),
  updateFolder: vi.fn(),
  updateRegularList: vi.fn(),
}));
const toastApi = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("./organizer-api-client", () => organizerApi);
vi.mock("sonner", () => ({ toast: toastApi }));

const INBOX_ID = "52a8bc35-2a7e-44ea-84c1-626383effc70";

beforeEach(() => {
  vi.clearAllMocks();
  organizerApi.deleteFolder.mockResolvedValue({
    ...folder(),
    deletedAt: "2026-07-19T01:00:00.000Z",
    version: 2,
  });
  organizerApi.deleteRegularList.mockResolvedValue({
    ...list(),
    deletedAt: "2026-07-19T01:00:00.000Z",
    version: 2,
  });
  organizerApi.restoreFolder.mockResolvedValue(folder());
  organizerApi.restoreRegularList.mockResolvedValue(list());
  organizerApi.getFolder.mockRejectedValue(new Error("not found"));
  organizerApi.getRegularList.mockRejectedValue(new Error("not found"));
});

describe("useOrganizerMutations", () => {
  it("deletes a list through Inbox and offers an honest immediate Undo", async () => {
    const { result } = renderHook(() => useOrganizerMutations(INBOX_ID), { wrapper: queryWrapper() });

    await act(() => result.current.deleteList(list()));

    expect(organizerApi.deleteRegularList).toHaveBeenCalledWith(list().id, {
      expectedVersion: 1,
      moveTasksToListId: INBOX_ID,
    });
    expect(toastApi.success).toHaveBeenCalledWith(
      "List deleted",
      expect.objectContaining({ description: "Its active tasks moved to Inbox." }),
    );

    const options = toastApi.success.mock.calls[0]?.[1] as { action?: { onClick?: () => void } } | undefined;
    options?.action?.onClick?.();

    await waitFor(() => expect(organizerApi.restoreRegularList).toHaveBeenCalledWith(list().id, 2));
    expect(toastApi.success).toHaveBeenCalledWith("List restored", {
      description: "Previously moved tasks remain in Inbox.",
    });
  });

  it("offers Undo after a folder soft delete", async () => {
    const { result } = renderHook(() => useOrganizerMutations(INBOX_ID), { wrapper: queryWrapper() });

    await act(() => result.current.deleteFolder(folder()));
    const options = toastApi.success.mock.calls[0]?.[1] as { action?: { onClick?: () => void } } | undefined;
    options?.action?.onClick?.();

    await waitFor(() => expect(organizerApi.restoreFolder).toHaveBeenCalledWith(folder().id, 2));
    expect(toastApi.success).toHaveBeenCalledWith("Folder restored");
  });

  it("offers Retry for a failed list Undo and uses the server's latest version", async () => {
    organizerApi.restoreRegularList.mockRejectedValueOnce(
      new TaskApiError({
        code: "CONFLICT",
        status: 409,
        detail: "The list changed elsewhere.",
        currentVersion: 7,
      }),
    );
    const { result } = renderHook(() => useOrganizerMutations(INBOX_ID), { wrapper: queryWrapper() });

    await act(() => result.current.deleteList(list()));
    toastAction(toastApi.success, "List deleted")?.onClick?.();

    await waitFor(() =>
      expect(toastApi.error).toHaveBeenCalledWith("List could not be restored", expect.anything()),
    );
    const retry = toastAction(toastApi.error, "List could not be restored");
    expect(retry?.label).toBe("Retry");
    retry?.onClick?.();

    await waitFor(() => expect(organizerApi.restoreRegularList).toHaveBeenNthCalledWith(2, list().id, 7));
    await waitFor(() =>
      expect(toastApi.success).toHaveBeenCalledWith("List restored", {
        description: "Previously moved tasks remain in Inbox.",
      }),
    );
  });

  it("offers Retry for a failed folder Undo and uses the server's latest version", async () => {
    organizerApi.restoreFolder.mockRejectedValueOnce(
      new TaskApiError({
        code: "CONFLICT",
        status: 409,
        detail: "The folder changed elsewhere.",
        currentVersion: 9,
      }),
    );
    const { result } = renderHook(() => useOrganizerMutations(INBOX_ID), { wrapper: queryWrapper() });

    await act(() => result.current.deleteFolder(folder()));
    toastAction(toastApi.success, "Folder deleted")?.onClick?.();

    await waitFor(() =>
      expect(toastApi.error).toHaveBeenCalledWith("Folder could not be restored", expect.anything()),
    );
    const retry = toastAction(toastApi.error, "Folder could not be restored");
    expect(retry?.label).toBe("Retry");
    retry?.onClick?.();

    await waitFor(() => expect(organizerApi.restoreFolder).toHaveBeenNthCalledWith(2, folder().id, 9));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith("Folder restored"));
  });

  it("reconciles a lost list-restore response when the authoritative list is already active", async () => {
    organizerApi.restoreRegularList.mockRejectedValueOnce(new TypeError("response lost"));
    organizerApi.getRegularList.mockResolvedValueOnce({ ...list(), version: 3 });
    const { result } = renderHook(() => useOrganizerMutations(INBOX_ID), { wrapper: queryWrapper() });

    await act(() => result.current.deleteList(list()));
    toastAction(toastApi.success, "List deleted")?.onClick?.();

    await waitFor(() => expect(organizerApi.getRegularList).toHaveBeenCalledWith(list().id));
    await waitFor(() =>
      expect(toastApi.success).toHaveBeenCalledWith("List restored", {
        description: "Previously moved tasks remain in Inbox.",
      }),
    );
    expect(organizerApi.restoreRegularList).toHaveBeenCalledTimes(1);
    expect(toastApi.error).not.toHaveBeenCalled();
  });

  it("reconciles a lost folder-restore response when the authoritative folder is already active", async () => {
    organizerApi.restoreFolder.mockRejectedValueOnce(new TypeError("response lost"));
    organizerApi.getFolder.mockResolvedValueOnce({ ...folder(), version: 3 });
    const { result } = renderHook(() => useOrganizerMutations(INBOX_ID), { wrapper: queryWrapper() });

    await act(() => result.current.deleteFolder(folder()));
    toastAction(toastApi.success, "Folder deleted")?.onClick?.();

    await waitFor(() => expect(organizerApi.getFolder).toHaveBeenCalledWith(folder().id));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith("Folder restored"));
    expect(organizerApi.restoreFolder).toHaveBeenCalledTimes(1);
    expect(toastApi.error).not.toHaveBeenCalled();
  });
});

function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function toastAction(mock: ReturnType<typeof vi.fn>, title: string) {
  const call = mock.mock.calls.find(([message]) => message === title);
  return (call?.[1] as { action?: { label?: string; onClick?: () => void } } | undefined)?.action;
}

function folder(): FolderDto {
  return {
    id: "f1c528b7-cfc6-4fe6-b5c2-9b536434a6fd",
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
    id: "81770f70-1b5b-450a-be9e-012569d256a6",
    folderId: folder().id,
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
