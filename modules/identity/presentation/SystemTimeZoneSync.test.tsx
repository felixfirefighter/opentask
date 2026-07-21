import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SystemTimeZoneSync } from "./SystemTimeZoneSync";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("SystemTimeZoneSync", () => {
  it("saves the detected browser timezone and refreshes the server projection", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Singapore",
    } as Intl.ResolvedDateTimeFormatOptions);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          schemaVersion: 2,
          version: 3,
          timezone: "UTC",
          weekStart: 1,
          hourCycle: "h12",
          theme: "system",
          reducedMotion: false,
          onboarding: { complete: false, completedAt: null, goals: [], checkins: [] },
        }),
      )
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemTimeZoneSync />);

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      expectedVersion: 3,
      patch: { timezone: "Asia/Singapore" },
    });
  });

  it("does not write when the saved timezone already matches the device", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "UTC",
    } as Intl.ResolvedDateTimeFormatOptions);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        schemaVersion: 2,
        version: 1,
        timezone: "UTC",
        weekStart: 1,
        hourCycle: "h12",
        theme: "system",
        reducedMotion: false,
        onboarding: { complete: false, completedAt: null, goals: [], checkins: [] },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemTimeZoneSync />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(refresh).not.toHaveBeenCalled();
  });
});
