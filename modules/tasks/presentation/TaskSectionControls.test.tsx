import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SectionDto } from "../application/contracts";
import { TaskApiError } from "./data/task-api-request";
import { SortableTaskSection } from "./SortableTaskSection";

import { CreateSectionControl, SectionActions } from "./TaskSectionControls";
import { isCompatibleSectionDrop, resolveSectionDrop, sectionSortId } from "./section-sort-policy";
import { TaskSectionSortContext } from "./TaskSectionSortContext";

const sectionMutations = vi.hoisted(() => ({ useSectionMutations: vi.fn() }));
vi.mock("./data/use-section-mutations", () => sectionMutations);

const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const SECTION_ID = "5fd78e58-6b11-42a4-bd68-324f6c408166";
const PREVIOUS_ID = "42bc09fb-a101-4f71-b82f-eb093d578ce0";
const NEXT_ID = "81afe3af-0cb9-42c6-b573-7a146959c9b7";

const actions = {
  create: mutation(),
  rename: mutation(),
  position: mutation(),
  remove: mutation(),
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) {
    action.error = null;
    action.isPending = false;
    action.mutate.mockReset();
    action.mutateAsync.mockReset().mockResolvedValue(section());
    action.reset.mockReset();
  }
  sectionMutations.useSectionMutations.mockReturnValue(actions);
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
});

describe("TaskSectionControls", () => {
  it("provides keyboard drag semantics while retaining the menu reorder fallback", async () => {
    const user = userEvent.setup();
    const sections = [section(), section({ id: NEXT_ID, name: "Later", rank: "b" })];
    render(
      <TaskSectionSortContext listId={LIST_ID} sections={sections}>
        <div>
          {sections.map((item) => (
            <SortableTaskSection
              className="section"
              key={item.id}
              labelledBy={`section-${item.id}`}
              section={item}
            >
              {(handle) => (
                <>
                  <h2 id={`section-${item.id}`}>{item.name}</h2>
                  {handle}
                </>
              )}
            </SortableTaskSection>
          ))}
        </div>
      </TaskSectionSortContext>,
    );

    const handle = screen.getByRole("button", { name: "Reorder section Next" });
    expect(document.getElementById(handle.getAttribute("aria-describedby")!)).toHaveTextContent(
      /press Space to pick it up/i,
    );
    handle.focus();
    await user.keyboard("[Space]");
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    expect(await screen.findByText("Next picked up at position 1 of 2.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await user.keyboard("[Escape]");
    await waitFor(() => expect(handle).not.toHaveAttribute("aria-pressed", "true"));
    expect(
      await screen.findByText("Next reorder cancelled and returned to position 1 of 2."),
    ).toBeInTheDocument();
    expect(actions.position.mutate).not.toHaveBeenCalled();
  });

  it("resolves section drops only within the same list rank scope", () => {
    const current = section();
    const next = section({ id: NEXT_ID, name: "Later", rank: "b" });
    const foreign = section({ id: PREVIOUS_ID, listId: "99999999-9999-4999-8999-999999999999" });

    expect(resolveSectionDrop(sectionSortId(current.id), sectionSortId(next.id), [current, next])).toEqual({
      section: current,
      placement: { kind: "after", anchorId: next.id },
    });
    expect(
      isCompatibleSectionDrop(sectionSortId(current.id), sectionSortId(foreign.id), [current, foreign]),
    ).toBe(false);
    expect(
      resolveSectionDrop(sectionSortId(current.id), sectionSortId(foreign.id), [current, foreign]),
    ).toBeNull();
  });

  it("creates a section through a labeled dialog", async () => {
    const user = userEvent.setup();
    render(<CreateSectionControl listId={LIST_ID} />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    const dialog = screen.getByRole("dialog", { name: "Create section" });
    await user.type(within(dialog).getByLabelText("Name"), "  Next actions  ");
    await user.click(within(dialog).getByRole("button", { name: "Create section" }));

    await waitFor(() =>
      expect(actions.create.mutateAsync).toHaveBeenCalledWith({
        name: "Next actions",
        resourceId: expect.any(String),
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Create section" })).not.toBeInTheDocument();
  });

  it("renames and exposes menu-based reorder in both directions", async () => {
    const user = userEvent.setup();
    render(
      <SectionActions
        listId={LIST_ID}
        nextSection={section({ id: NEXT_ID, name: "Later" })}
        previousSection={section({ id: PREVIOUS_ID, name: "First" })}
        section={section()}
        taskCount={0}
      />,
    );

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Move section up" }));
    expect(actions.position.mutate).toHaveBeenCalledWith({
      section: section(),
      placement: { kind: "before", anchorId: PREVIOUS_ID },
    });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Move section down" }));
    expect(actions.position.mutate).toHaveBeenCalledWith({
      section: section(),
      placement: { kind: "after", anchorId: NEXT_ID },
    });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Rename section" }));
    const dialog = screen.getByRole("dialog", { name: "Rename section" });
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "In progress");
    await user.click(within(dialog).getByRole("button", { name: "Rename section" }));
    await waitFor(() =>
      expect(actions.rename.mutateAsync).toHaveBeenCalledWith({
        name: "In progress",
        section: section(),
      }),
    );
  });

  it("blocks non-empty deletion and confirms permanent empty-section deletion", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SectionActions listId={LIST_ID} section={section()} taskCount={2} />);

    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: "Delete section…" })).toHaveAttribute("data-disabled");
    expect(screen.getByText("Move its 2 tasks before deleting.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    rerender(<SectionActions listId={LIST_ID} section={section()} taskCount={0} />);
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Delete section…" }));
    const confirmation = screen.getByRole("alertdialog", { name: `Delete “${section().name}”?` });
    expect(within(confirmation).getByRole("button", { name: "Keep section" })).toHaveFocus();
    expect(actions.remove.mutateAsync).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "Delete section" }));
    await waitFor(() => expect(actions.remove.mutateAsync).toHaveBeenCalledWith(section()));
  });

  it("disables writes offline and preserves a rename draft after conflict", async () => {
    const user = userEvent.setup();
    let online = false;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
    const { rerender } = render(<CreateSectionControl listId={LIST_ID} />);
    expect(screen.getByRole("button", { name: "Add section" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect to create sections.");

    online = true;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })));
    act(() => window.dispatchEvent(new Event("online")));
    actions.rename.error = new TaskApiError({
      code: "CONFLICT",
      status: 409,
      detail: "Conflict",
    });
    actions.rename.mutateAsync.mockRejectedValue(actions.rename.error);
    rerender(<SectionActions listId={LIST_ID} section={section()} taskCount={0} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `Open actions for section ${section().name}` }),
      ).toBeEnabled(),
    );
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Rename section" }));
    const dialog = screen.getByRole("dialog", { name: "Rename section" });
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Unsent draft");
    await user.click(within(dialog).getByRole("button", { name: "Rename section" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(name).toHaveValue("Unsent draft");
  });
});

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: `Open actions for section ${section().name}` }));
}

function mutation() {
  return {
    error: null as Error | null,
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  };
}

function section(overrides: Partial<SectionDto> = {}): SectionDto {
  return {
    id: SECTION_ID,
    listId: LIST_ID,
    name: "Next",
    rank: "a",
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}
