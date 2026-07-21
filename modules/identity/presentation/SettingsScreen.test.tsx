import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserPreferences } from "../application/preferences-contract";
import { SettingsScreen } from "./SettingsScreen";

const initialPreferences: UserPreferences = {
  schemaVersion: 2,
  version: 1,
  timezone: "UTC",
  weekStart: 1,
  hourCycle: "h12",
  theme: "light",
  reducedMotion: false,
  onboarding: {
    complete: false,
    completedAt: null,
    goals: [],
    checkins: [],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  delete document.documentElement.dataset.reducedMotion;
});

describe("SettingsScreen", () => {
  it("saves each card with an optimistic version and preserves edits in the other card", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...initialPreferences,
        version: 2,
        weekStart: 0,
        hourCycle: "h23",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen initialPreferences={initialPreferences} />);

    await user.click(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u }));
    await user.selectOptions(screen.getByLabelText("Week starts on"), "0");
    await user.click(screen.getByRole("radio", { name: "13:30" }));
    await user.click(screen.getByRole("button", { name: "Save date and time" }));

    await screen.findByText("Saved");
    expect(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u })).toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(request?.body))).toEqual({
      expectedVersion: 1,
      patch: { weekStart: 0, hourCycle: "h23" },
    });
  });

  it("previews appearance immediately and rolls it back after a failed save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen initialPreferences={initialPreferences} />);

    await user.click(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Save appearance" }));

    expect(await screen.findByText(/These settings were not saved/u)).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
  });

  it("blocks duplicate saves synchronously", async () => {
    const user = userEvent.setup();
    let resolveResponse: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen initialPreferences={initialPreferences} />);

    const save = screen.getByRole("button", { name: "Save appearance" });
    await user.click(save);
    await user.click(save);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse?.(Response.json({ ...initialPreferences, version: 2 }));
    await screen.findByText("Saved");
  });
});
