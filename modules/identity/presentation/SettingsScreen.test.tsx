import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserPreferences } from "../application/preferences-contract";
import { SettingsScreen } from "./SettingsScreen";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh }),
}));

const initialPreferences: UserPreferences = {
  schemaVersion: 1,
  version: 1,
  timezone: "UTC",
  weekStart: 1,
  hourCycle: "h12",
  theme: "light",
  reducedMotion: false,
};
const availableAi = { state: "available" } as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.refresh.mockReset();
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
        timezone: "Asia/Singapore",
        weekStart: 0,
        hourCycle: "h23",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    await user.click(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u }));
    const timezone = screen.getByRole("combobox", { name: /^Timezone/u });
    await user.clear(timezone);
    await user.type(timezone, "Asia/Singapore");
    await user.selectOptions(screen.getByLabelText("Week starts on"), "0");
    await user.click(screen.getByRole("radio", { name: "13:30" }));
    await user.click(screen.getByRole("button", { name: "Save date and time" }));

    await screen.findByText("Saved");
    expect(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u })).toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(request?.body))).toEqual({
      expectedVersion: 1,
      patch: { timezone: "Asia/Singapore", weekStart: 0, hourCycle: "h23" },
    });
    expect(dispatchEvent.mock.calls.some(([event]) => event.type === "opentask:workspace-data-changed")).toBe(
      true,
    );
  });

  it("previews appearance immediately and rolls it back after a failed save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    await user.click(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Save appearance" }));

    expect(await screen.findByText(/These settings were not saved/u)).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
  });

  it("confirms an appearance save when review finds the attempted values authoritative", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ ...initialPreferences, version: 2, theme: "dark" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    await user.click(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u }));
    await user.click(screen.getByRole("button", { name: "Save appearance" }));

    expect(await screen.findByText(/Settings changed elsewhere/u)).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("button", { name: "Review latest" }));
    await screen.findByText("Saved");
    expect(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.queryByText(/save again when ready/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review latest" })).not.toBeInTheDocument();
  });

  it("preserves an appearance draft when review finds different authoritative values", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(Response.json({ ...initialPreferences, version: 2, theme: "system" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    await user.click(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u }));
    await user.click(screen.getByRole("button", { name: "Save appearance" }));

    expect(await screen.findByText(/save outcome could not be confirmed/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review latest" }));
    await screen.findByText(/Latest saved values loaded/u);

    expect(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText(/save again when ready/u)).toBeInTheDocument();
  });

  it("treats a server error after send as an unconfirmed save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    await user.selectOptions(screen.getByLabelText("Week starts on"), "0");
    await user.click(screen.getByRole("button", { name: "Save date and time" }));

    expect(await screen.findByText(/save outcome could not be confirmed/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review latest" })).toBeInTheDocument();
  });

  it("confirms matching date-time values and keeps review route invalidation", async () => {
    const user = userEvent.setup();
    const latest = {
      ...initialPreferences,
      version: 2,
      timezone: "Asia/Singapore",
      weekStart: 0,
      hourCycle: "h23" as const,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(Response.json(latest));
    vi.stubGlobal("fetch", fetchMock);
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    const timezone = screen.getByRole("combobox", { name: /^Timezone/u });
    await user.clear(timezone);
    await user.type(timezone, "Asia/Singapore");
    await user.selectOptions(screen.getByLabelText("Week starts on"), "0");
    await user.click(screen.getByRole("radio", { name: "13:30" }));
    await user.click(screen.getByRole("button", { name: "Save date and time" }));

    expect(await screen.findByText(/save outcome could not be confirmed/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review latest" }));
    await screen.findByText("Saved");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timezone).toHaveValue("Asia/Singapore");
    expect(screen.getByLabelText("Week starts on")).toHaveValue("0");
    expect(screen.getByRole("radio", { name: "13:30" })).toBeChecked();
    expect(screen.queryByText(/save again when ready/u)).not.toBeInTheDocument();
    expect(dispatchEvent.mock.calls.some(([event]) => event.type === "opentask:workspace-data-changed")).toBe(
      true,
    );
  });

  it("blocks duplicate saves synchronously", async () => {
    const user = userEvent.setup();
    let resolveResponse: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    const save = screen.getByRole("button", { name: "Save appearance" });
    await user.click(save);
    await user.click(save);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radio", { name: /Light.*Warm neutral canvas/u })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();

    resolveResponse?.(Response.json({ ...initialPreferences, version: 2 }));
    await screen.findByText("Saved");
    expect(screen.getByRole("radio", { name: /Light.*Warm neutral canvas/u })).toBeEnabled();
  });

  it("preserves edited fields while loading the latest version after a conflict", async () => {
    const user = userEvent.setup();
    const latest: UserPreferences = {
      ...initialPreferences,
      version: 2,
      weekStart: 0,
      theme: "system",
    };
    let patchCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "PATCH") {
        patchCount += 1;
        if (patchCount === 1) return new Response(null, { status: 409 });
        return Response.json({
          ...latest,
          version: 3,
          timezone: "Asia/Singapore",
          theme: "dark",
        });
      }
      return Response.json(latest);
    });
    vi.stubGlobal("fetch", fetchMock);
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    render(<SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />);

    const timezone = screen.getByRole("combobox", { name: /^Timezone/u });
    await user.clear(timezone);
    await user.type(timezone, "Asia/Singapore");
    await user.click(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u }));
    await user.click(screen.getByRole("button", { name: "Save date and time" }));

    await screen.findByText(/Settings changed elsewhere/u);
    await user.click(screen.getByRole("button", { name: "Review latest" }));
    await screen.findByText(/Your edits are still here/u);

    expect(timezone).toHaveValue("Asia/Singapore");
    expect(screen.getByLabelText("Week starts on")).toHaveValue("0");
    expect(screen.getByRole("radio", { name: /Dark.*Low-light workspace/u })).toBeChecked();
    expect(dispatchEvent.mock.calls.some(([event]) => event.type === "opentask:workspace-data-changed")).toBe(
      true,
    );

    await user.click(screen.getByRole("button", { name: "Save date and time" }));
    await screen.findByText("Saved");
    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    const [, retryRequest] = patchCalls[1] ?? [];
    expect(JSON.parse(String(retryRequest?.body))).toMatchObject({
      expectedVersion: 2,
      patch: { timezone: "Asia/Singapore", weekStart: 0 },
    });
  });

  it("shows accurate available and no-key AI states with manual paths", () => {
    const { rerender } = render(
      <SettingsScreen aiCapability={availableAi} initialPreferences={initialPreferences} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Available");
    expect(screen.getByRole("link", { name: "Open AI Review" })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: "Plan manually in Today" })).toHaveAttribute("href", "/today");
    expect(screen.getByRole("link", { name: "Open Calendar" })).toHaveAttribute("href", "/calendar");

    rerender(
      <SettingsScreen
        aiCapability={{ state: "disabled", reason: "missing_api_key" }}
        initialPreferences={initialPreferences}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Not configured");
    expect(
      screen.getByText(/Manual task and calendar planning continue to work without it/u),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open AI Review" })).not.toBeInTheDocument();
  });
});
