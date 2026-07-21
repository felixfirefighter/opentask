import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import type { MutablePlanningTask } from "./use-planning-task-controller";

const TASK_ID = "352493c8-1e29-4dc1-bde7-bffac1c190d2";

describe("ScheduleEditorDialog", () => {
  it("preserves the unsaved schedule draft when a conflict refreshes the task version", () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue("failed");
    const view = render(
      <ScheduleEditorDialog
        localDate="2026-07-20"
        task={task(1)}
        timeZone="Asia/Singapore"
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-24" } });
    fireEvent.change(screen.getByLabelText("End date (exclusive)"), {
      target: { value: "2026-07-25" },
    });

    view.rerender(
      <ScheduleEditorDialog
        localDate="2026-07-20"
        task={task(2)}
        timeZone="Asia/Singapore"
        onClose={onClose}
        onSave={onSave}
      />,
    );

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-07-24");
    expect(screen.getByLabelText("End date (exclusive)")).toHaveValue("2026-07-25");
  });

  it("prevents Escape dismissal while a schedule save is unresolved", async () => {
    const user = userEvent.setup();
    const request = deferred<"failed">();
    const onClose = vi.fn();
    render(
      <ScheduleEditorDialog
        localDate="2026-07-20"
        task={task(1)}
        timeZone="Asia/Singapore"
        onClose={onClose}
        onSave={() => request.promise}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await screen.findByRole("button", { name: "Saving…" });
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Edit schedule" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    request.resolve("failed");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("warns before Escape discards a dirty schedule", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ScheduleEditorDialog
        localDate="2026-07-20"
        task={task(1)}
        timeZone="Asia/Singapore"
        onClose={onClose}
        onSave={vi.fn().mockResolvedValue("saved")}
      />,
    );

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-24" } });
    await user.keyboard("{Escape}");
    expect(confirm).toHaveBeenCalledWith("Discard these unsaved schedule changes?");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-07-24");

    confirm.mockReturnValue(true);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("keeps an unconfirmed schedule draft and uses honest recovery copy", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleEditorDialog
        localDate="2026-07-20"
        task={task(1)}
        timeZone="Asia/Singapore"
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue("unconfirmed")}
      />,
    );

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-24" } });
    fireEvent.change(screen.getByLabelText("End date (exclusive)"), {
      target: { value: "2026-07-25" },
    });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("outcome could not be confirmed");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-07-24");
    expect(screen.getByRole("dialog", { name: "Edit schedule" })).toBeInTheDocument();
  });
});

function task(version: number): MutablePlanningTask {
  return {
    id: TASK_ID,
    title: "Alpha",
    version,
    schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
