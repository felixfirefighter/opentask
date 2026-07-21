import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileSetupLauncher } from "./ProfileSetupLauncher";

const baseOnboarding = {
  complete: false,
  completedAt: null,
  goals: [],
  checkins: [],
  todayCheckin: null,
} as const;

describe("ProfileSetupLauncher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("runs the scripted first-run flow and persists before entering Today", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ redirectTo: "/inbox" }))
      .mockResolvedValueOnce(Response.json(baseOnboarding))
      .mockResolvedValueOnce(Response.json({ configured: false, source: "none" }))
      .mockResolvedValueOnce(Response.json({ ...baseOnboarding, complete: true, goals: ["tasks"] }));
    render(<ProfileSetupLauncher navigate={navigate} />);

    const name = await screen.findByRole("textbox", { name: "Your name" }, { timeout: 8_000 });
    await user.type(name, "  Ekko  ");
    await user.click(await screen.findByRole("button", { name: /^Continue$/u }));
    await user.click(await screen.findByRole("button", { name: "Skip for now" }, { timeout: 8_000 }));
    await user.click(await screen.findByRole("button", { name: "tracking tasks" }, { timeout: 8_000 }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Let's start" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/today"));
    expect(window.localStorage.getItem("omplish.profile.username")).toBe("Ekko");
    expect(fetch).toHaveBeenCalledWith("/api/v1/onboarding", expect.objectContaining({ method: "POST" }));
  }, 30_000);

  it("keeps setup readable when the workspace bootstrap fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: false }, { status: 503 }));
    render(<ProfileSetupLauncher navigate={vi.fn()} />);

    const name = await screen.findByRole("textbox", { name: "Your name" }, { timeout: 8_000 });
    await user.type(name, "Ekko");
    await user.click(await screen.findByRole("button", { name: /^Continue$/u }, { timeout: 8_000 }));

    expect(
      await screen.findByRole("heading", { name: "We couldn’t open your workspace." }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("omplish.profile.username")).toBeNull();
  });

  it("gates a returning profile behind the scripted no-key check-in", async () => {
    window.localStorage.setItem("omplish.profile.username", "Ekko");
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ ...baseOnboarding, complete: true }))
      .mockResolvedValueOnce(Response.json({ configured: false, source: "none" }));
    render(<ProfileSetupLauncher navigate={vi.fn()} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("group", { name: "How you are arriving today" }, { timeout: 8_000 }),
    ).toBeInTheDocument();
  });
});
