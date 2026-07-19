import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TagDto } from "../../application/contracts";
import { TaskApiError } from "./task-api-request";
import { useDeleteTagMutation } from "./use-tag-mutations";

const tagApi = vi.hoisted(() => ({
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  getTag: vi.fn(),
  restoreTag: vi.fn(),
  updateTag: vi.fn(),
}));
const toastApi = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("./tag-api-client", () => tagApi);
vi.mock("sonner", () => ({ toast: toastApi }));

const TAG_ID = "064e93d7-f8c6-49f5-99af-01d46f2ebcd1";

beforeEach(() => {
  vi.clearAllMocks();
  tagApi.deleteTag.mockResolvedValue({
    ...tag(),
    deletedAt: "2026-07-19T01:00:00.000Z",
    version: 2,
  });
  tagApi.getTag.mockRejectedValue(new Error("not found"));
  tagApi.restoreTag.mockResolvedValue({ ...tag(), version: 6 });
});

describe("tag delete Undo recovery", () => {
  it("offers Retry after restore failure and retries with the server's latest version", async () => {
    tagApi.restoreTag.mockRejectedValueOnce(
      new TaskApiError({
        code: "CONFLICT",
        status: 409,
        detail: "The tag changed elsewhere.",
        currentVersion: 5,
      }),
    );
    const { result } = renderHook(() => useDeleteTagMutation(), { wrapper: queryWrapper() });

    await act(() => result.current.mutateAsync(tag()));
    const undo = toastAction(toastApi.success, "Tag deleted");
    expect(undo?.label).toBe("Undo");
    undo?.onClick?.();

    await waitFor(() => expect(tagApi.restoreTag).toHaveBeenCalledWith(TAG_ID, 2));
    await waitFor(() =>
      expect(toastApi.error).toHaveBeenCalledWith("Tag could not be restored", expect.anything()),
    );

    const retry = toastAction(toastApi.error, "Tag could not be restored");
    expect(retry?.label).toBe("Retry");
    retry?.onClick?.();

    await waitFor(() => expect(tagApi.restoreTag).toHaveBeenNthCalledWith(2, TAG_ID, 5));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith("Tag restored"));
  });

  it("reconciles a lost restore response when the authoritative tag is already active", async () => {
    tagApi.restoreTag.mockRejectedValueOnce(new TypeError("response lost"));
    tagApi.getTag.mockResolvedValueOnce({ ...tag(), version: 3 });
    const { result } = renderHook(() => useDeleteTagMutation(), { wrapper: queryWrapper() });

    await act(() => result.current.mutateAsync(tag()));
    toastAction(toastApi.success, "Tag deleted")?.onClick?.();

    await waitFor(() => expect(tagApi.getTag).toHaveBeenCalledWith(TAG_ID));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith("Tag restored"));
    expect(tagApi.restoreTag).toHaveBeenCalledTimes(1);
    expect(toastApi.error).not.toHaveBeenCalled();
  });
});

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function toastAction(mock: ReturnType<typeof vi.fn>, title: string) {
  const call = mock.mock.calls.find(([message]) => message === title);
  return (call?.[1] as { action?: { label?: string; onClick?: () => void } } | undefined)?.action;
}

function tag(): TagDto {
  return {
    id: TAG_ID,
    name: "Launch",
    colorToken: "coral",
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}
