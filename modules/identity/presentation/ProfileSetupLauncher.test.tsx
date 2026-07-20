import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileSetupLauncher } from "./ProfileSetupLauncher";

describe("ProfileSetupLauncher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("requires a username and bootstraps before caching it", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: "/inbox" }),
    } as Response);
    render(<ProfileSetupLauncher navigate={navigate} />);

    await user.click(screen.getByRole("button", { name: "Open workspace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a username");

    await user.type(screen.getByLabelText("Profile username"), "  Ekko  ");
    await user.click(screen.getByRole("button", { name: "Open workspace" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/inbox"));
    expect(window.localStorage.getItem("opentask.profile.username")).toBe("Ekko");
    expect(fetch).toHaveBeenCalledWith("/api/v1/demo", expect.objectContaining({ method: "POST" }));
  });

  it("keeps setup open when workspace bootstrap fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(<ProfileSetupLauncher navigate={vi.fn()} />);

    await user.type(screen.getByLabelText("Profile username"), "Ekko");
    await user.click(screen.getByRole("button", { name: "Open workspace" }));

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent("could not be opened");
    expect(window.localStorage.getItem("opentask.profile.username")).toBeNull();
  });

  it("opens a cached profile directly", async () => {
    window.localStorage.setItem("opentask.profile.username", "Ekko");
    const navigate = vi.fn();
    render(<ProfileSetupLauncher navigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/inbox"));
    expect(screen.queryByRole("dialog", { name: "Set up your profile" })).not.toBeInTheDocument();
  });
});
