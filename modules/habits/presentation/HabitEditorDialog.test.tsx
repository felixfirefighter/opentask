import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HabitEditorDialog } from "./HabitEditorDialog";
import { emptyHabitDraft } from "./habit-form-policy";

describe("HabitEditorDialog", () => {
  it("places initial focus on the visible Title field", async () => {
    renderEditor();

    const title = screen.getByRole("textbox", { name: "Title" });
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("keeps the entered form available after validation fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderEditor({ onSubmit });
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.type(title, "   ");

    await user.click(screen.getByRole("button", { name: "Create habit" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Review the highlighted field");
    expect(title).toHaveValue("   ");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute("aria-describedby", expect.stringContaining("habit-editor-error-summary"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires in-modal conflict review and merges only untouched fields from latest", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const base = {
      ...emptyHabitDraft("Asia/Singapore", "2026-07-20"),
      title: "Server title",
      icon: "☀️",
    };
    const latest = { ...base, icon: "🔥", timezone: "UTC" };
    renderEditor({
      conflictPendingReview: true,
      errorMessage: "This habit changed elsewhere.",
      initialDraft: base,
      mode: "edit",
      onReviewLatest: vi.fn().mockResolvedValue(latest),
      onSubmit,
    });
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Local title");

    expect(screen.getByRole("button", { name: "Save habit" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Review latest in this form" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save habit" })).toBeEnabled());
    expect(title).toHaveValue("Local title");
    expect(screen.getByRole("textbox", { name: "Icon or emoji" })).toHaveValue("🔥");
    expect(screen.getByRole("textbox", { name: "Timezone" })).toHaveValue("UTC");
    await user.click(screen.getByRole("button", { name: "Save habit" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Local title", icon: "🔥" }),
      expect.objectContaining({ title: "Local title", icon: "🔥", timezone: "UTC" }),
    );
  });

  it("keeps Cancel usable while offline and blocks submit re-entry", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn();
    renderEditor({ onOpenChange, onSubmit, uncertainOutcome: true, writeDisabled: true });

    expect(screen.getByRole("button", { name: "Retry unchanged habit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect before saving");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

function renderEditor(overrides: Partial<React.ComponentProps<typeof HabitEditorDialog>> = {}) {
  return render(
    <HabitEditorDialog
      initialDraft={emptyHabitDraft("Asia/Singapore", "2026-07-20")}
      mode="create"
      onOpenChange={() => undefined}
      onSubmit={() => undefined}
      open
      pending={false}
      {...overrides}
    />,
  );
}
