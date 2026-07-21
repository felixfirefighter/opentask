import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  habitDay,
  habitDetail,
  habitLog,
  habitMonth,
  TEST_HABIT_ID,
  TEST_LOCAL_DATE,
} from "./habit-presentation-test-support";
import { HabitCheckInControl } from "./HabitCheckInControl";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HabitCheckInControl", () => {
  it("records a boolean local-day log with a stable idempotency key", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ outcome: "created", log: habitLog() }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", {
      randomUUID: () => "5e63d7bb-b861-4ca4-8e67-80d0456e0d08",
    });
    renderControl();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Habit day saved.");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/v1/habits/${TEST_HABIT_ID}/logs`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe("5e63d7bb-b861-4ca4-8e67-80d0456e0d08");
    expect(JSON.parse(String(init.body))).toEqual({
      localDate: TEST_LOCAL_DATE,
      value: { state: "completed", quantity: null, note: null },
    });
  });

  it("surfaces a same-day conflict without claiming the check-in succeeded", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            type: "https://opentask.local/problems/conflict",
            title: "Conflict",
            status: 409,
            code: "CONFLICT",
            detail: "Habit day changed.",
            correlationId: "test-correlation",
            currentVersion: 2,
          },
          { status: 409 },
        ),
      ),
    );
    vi.stubGlobal("crypto", {
      randomUUID: () => "5e63d7bb-b861-4ca4-8e67-80d0456e0d08",
    });
    renderControl();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(screen.getByRole("button", { name: "Review latest" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText("Habit day saved.")).not.toBeInTheDocument();
  });

  it("requires an explicit numeric quantity and preserves the entered note on validation", async () => {
    const user = userEvent.setup();
    renderControl({
      detail: habitDetail({
        goal: { goalKind: "quantity", targetValue: 2, unit: "litres" },
      }),
    });

    await user.click(screen.getByRole("button", { name: "Enter quantity" }));
    const quantity = screen.getByRole("spinbutton", { name: /^Quantity \(litres\)/u });
    await user.clear(quantity);
    await user.type(screen.getByRole("textbox", { name: /Note/u }), "Felt steady");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a nonnegative quantity");
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(quantity).toHaveAttribute("aria-describedby", expect.stringContaining("habit-day-editor-error"));
    expect(screen.getByRole("textbox", { name: /Note/u })).toHaveValue("Felt steady");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not offer a create action for an unscheduled day without a log", () => {
    renderControl({ day: habitDay(TEST_LOCAL_DATE, { scheduled: false, status: "not_scheduled" }) });

    expect(screen.getByText("Not scheduled", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter quantity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More check-in actions/u })).not.toBeInTheDocument();
  });

  it("keeps an existing unscheduled log editable and undoable", async () => {
    const user = userEvent.setup();
    renderControl({
      day: habitDay(TEST_LOCAL_DATE, {
        log: habitLog(),
        scheduled: false,
        status: "successful",
        successful: true,
      }),
    });

    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /More check-in actions/u }));
    expect(screen.getByRole("menuitem", { name: "Edit check-in…" })).toBeEnabled();
  });

  it("opens the check-in editor after the action menu closes", async () => {
    const user = userEvent.setup();
    renderControl({
      day: habitDay(TEST_LOCAL_DATE, {
        log: habitLog({ note: "Felt steady" }),
        status: "successful",
        successful: true,
      }),
    });

    await user.click(screen.getByRole("button", { name: /More check-in actions/u }));
    await user.click(screen.getByRole("menuitem", { name: "Edit check-in…" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note (optional)" })).toHaveValue("Felt steady");
  });

  it("keeps an open draft closable but blocks saving when writes become disabled", async () => {
    const user = userEvent.setup();
    const rendered = renderControl({
      detail: habitDetail({ goal: { goalKind: "quantity", targetValue: 2, unit: "litres" } }),
    });
    await user.click(screen.getByRole("button", { name: "Enter quantity" }));

    rendered.rerenderControl({ disabled: true });

    expect(screen.getByRole("button", { name: "Save check-in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect before saving");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reviews a remote log deletion, preserves dirty note text, and records against the latest state", async () => {
    const user = userEvent.setup();
    const remoteMonth = habitMonth();
    const monthAfterDeletion = {
      ...remoteMonth,
      days: remoteMonth.days.map((candidate) =>
        candidate.localDate === TEST_LOCAL_DATE
          ? { ...candidate, log: null, status: "open" as const, successful: false }
          : candidate,
      ),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (method === "PATCH") {
        return Response.json(
          {
            type: "https://opentask.local/problems/conflict",
            title: "Conflict",
            status: 409,
            code: "CONFLICT",
            detail: "Habit day changed.",
            correlationId: "test-correlation",
            currentVersion: 2,
          },
          { status: 409 },
        );
      }
      if (method === "GET" && path.includes("/month?")) return Response.json(monthAfterDeletion);
      if (method === "POST") {
        return Response.json({
          outcome: "created",
          log: habitLog({ quantity: 2, note: "Local note" }),
        });
      }
      throw new Error(`Unexpected habit request: ${method} ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "5e63d7bb-b861-4ca4-8e67-80d0456e0d08" });
    renderControl({
      day: habitDay(TEST_LOCAL_DATE, {
        log: habitLog({ quantity: 5, note: "Remote base" }),
        status: "successful",
        successful: true,
      }),
      detail: habitDetail({ goal: { goalKind: "quantity", targetValue: 2, unit: "litres" } }),
    });

    await user.click(screen.getByRole("button", { name: "Edit check-in" }));
    const dialog = screen.getByRole("dialog");
    const note = within(dialog).getByRole("textbox", { name: /Note/u });
    await user.clear(note);
    await user.type(note, "Local note");
    await user.click(within(dialog).getByRole("button", { name: "Save check-in" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(within(dialog).getByRole("button", { name: "Save check-in" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Review latest in this form" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("spinbutton", { name: "Quantity (litres)" })).toHaveValue(2),
    );
    expect(note).toHaveValue("Local note");
    expect(within(dialog).getByRole("button", { name: "Save check-in" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Save check-in" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Habit day saved");

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      localDate: TEST_LOCAL_DATE,
      value: { state: "completed", quantity: 2, note: "Local note" },
    });
  });
});

function renderControl(overrides: Partial<React.ComponentProps<typeof HabitCheckInControl>> = {}) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const element = (nextOverrides: Partial<React.ComponentProps<typeof HabitCheckInControl>>) => (
    <QueryClientProvider client={client}>
      <HabitCheckInControl
        day={habitDay(TEST_LOCAL_DATE)}
        detail={habitDetail()}
        {...overrides}
        {...nextOverrides}
      />
    </QueryClientProvider>
  );
  const rendered = render(element({}));
  return {
    ...rendered,
    rerenderControl(nextOverrides: Partial<React.ComponentProps<typeof HabitCheckInControl>>) {
      rendered.rerender(element(nextOverrides));
    },
  };
}
