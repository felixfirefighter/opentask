import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TaskListItemDto } from "../application/contracts";
import { TaskRow } from "./TaskRow";

describe("TaskRow", () => {
  it("keeps opening and status changes as separate accessible actions", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <TaskRow
        task={taskRow()}
        detailsHref="/tasks/00000000-0000-4000-8000-000000000010"
        onDelete={vi.fn()}
        onPriorityChange={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByRole("link", { name: /prepare demo/i })).toHaveAttribute(
      "href",
      "/tasks/00000000-0000-4000-8000-000000000010",
    );
    await user.click(screen.getByRole("button", { name: "Complete Prepare demo" }));
    expect(onStatusChange).toHaveBeenCalledWith("completed");
  });

  it("labels cancelled work distinctly from completed work", () => {
    render(
      <TaskRow
        task={taskRow({ status: "cancelled" })}
        detailsHref="/tasks/00000000-0000-4000-8000-000000000010"
        onDelete={vi.fn()}
        onPriorityChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore Prepare demo" })).toBeInTheDocument();
  });

  it("opens an active recurring task instead of completing the whole series", () => {
    render(
      <TaskRow
        task={taskRow({ recurrence: { status: "active" } })}
        detailsHref="/tasks/00000000-0000-4000-8000-000000000010"
        onDelete={vi.fn()}
        onPriorityChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Repeat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open recurring task Prepare demo" })).toHaveAttribute(
      "href",
      "/tasks/00000000-0000-4000-8000-000000000010",
    );
    expect(screen.queryByRole("button", { name: "Complete Prepare demo" })).not.toBeInTheDocument();
  });

  it("keeps ended series available as ordinary one-off work", () => {
    render(
      <TaskRow
        task={taskRow({ recurrence: { status: "ended" } })}
        detailsHref="/tasks/00000000-0000-4000-8000-000000000010"
        onDelete={vi.fn()}
        onPriorityChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Repeat ended")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Prepare demo" })).toBeInTheDocument();
  });

  it("allows a cancelled active series to be restored", () => {
    render(
      <TaskRow
        task={taskRow({ status: "cancelled", recurrence: { status: "active" } })}
        detailsHref="/tasks/00000000-0000-4000-8000-000000000010"
        onDelete={vi.fn()}
        onPriorityChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Restore Prepare demo" })).toBeInTheDocument();
  });

  it("keeps the textual recurrence marker beside terminal context", () => {
    render(
      <TaskRow
        task={taskRow({ status: "cancelled", recurrence: { status: "active" } })}
        contextLabel="Cancelled July 20"
        detailsHref="/tasks/00000000-0000-4000-8000-000000000010"
        onDelete={vi.fn()}
        onPriorityChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancelled July 20")).toBeInTheDocument();
    expect(screen.getByText("Repeat")).toBeInTheDocument();
  });
});

function taskRow(overrides: Partial<TaskListItemDto> = {}): TaskListItemDto {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    version: 1,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
    deletedAt: null,
    listId: "00000000-0000-4000-8000-000000000020",
    sectionId: null,
    parentTaskId: null,
    title: "Prepare demo",
    descriptionMd: "",
    status: "open",
    priority: "high",
    rank: "a0",
    statusChangedAt: "2026-07-19T01:00:00.000Z",
    tags: [],
    recurrence: null,
    ...overrides,
  };
}
