import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SectionDto } from "../../application/contracts";

import { taskQueryKeys } from "./task-query-keys";
import { useSectionMutations } from "./use-section-mutations";

const organizerApi = vi.hoisted(() => ({
  createSection: vi.fn(),
  deleteSection: vi.fn(),
  positionSection: vi.fn(),
  updateSection: vi.fn(),
}));

vi.mock("./organizer-api-client", () => organizerApi);

const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const SECTION_ID = "5fd78e58-6b11-42a4-bd68-324f6c408166";
const ANCHOR_ID = "42bc09fb-a101-4f71-b82f-eb093d578ce0";

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(organizerApi).forEach((request) => request.mockResolvedValue(section()));
});

describe("useSectionMutations", () => {
  it("binds create, rename, and position requests to the current list", async () => {
    const { result } = renderMutations();

    await result.current.create.mutateAsync({ name: "Planning", resourceId: SECTION_ID });
    expect(organizerApi.createSection).toHaveBeenCalledWith(LIST_ID, SECTION_ID, {
      name: "Planning",
      placement: { kind: "end" },
    });

    await result.current.rename.mutateAsync({ name: "Next", section: section() });
    expect(organizerApi.updateSection).toHaveBeenCalledWith(LIST_ID, SECTION_ID, {
      expectedVersion: 3,
      patch: { name: "Next" },
    });

    await result.current.position.mutateAsync({
      section: section(),
      placement: { kind: "before", anchorId: ANCHOR_ID },
    });
    expect(organizerApi.positionSection).toHaveBeenCalledWith(LIST_ID, SECTION_ID, {
      expectedVersion: 3,
      placement: { kind: "before", anchorId: ANCHOR_ID },
    });
  });

  it("invalidates section and task-list projections after permanent deletion", async () => {
    const { client, result } = renderMutations();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await result.current.remove.mutateAsync(section());
    await waitFor(() => {
      expect(organizerApi.deleteSection).toHaveBeenCalledWith(LIST_ID, SECTION_ID, 3);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: taskQueryKeys.sections(LIST_ID) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: taskQueryKeys.list(LIST_ID) });
    });
  });
});

function renderMutations() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useSectionMutations(LIST_ID), { wrapper }) };
}

function section(): SectionDto {
  return {
    id: SECTION_ID,
    listId: LIST_ID,
    name: "Ready",
    rank: "a",
    version: 3,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}
