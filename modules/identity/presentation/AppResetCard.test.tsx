import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppResetCard } from "./AppResetCard";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AppResetCard", () => {
  it("requires confirmation, resets the server profile, clears local app state, and returns to launch", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ redirectTo: "/" }));
    const navigate = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("opentask.profile.username", "Ekko");
    window.localStorage.setItem("opentask-theme-preference", "dark");
    render(<AppResetCard navigate={navigate} />);

    await user.click(screen.getByRole("button", { name: "Reset app" }));
    const dialog = screen.getByRole("alertdialog", { name: "Reset OpenTask?" });
    expect(dialog).toHaveTextContent("You cannot undo this action.");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Reset app" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/reset",
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
    expect(window.localStorage.getItem("opentask.profile.username")).toBeNull();
    expect(window.localStorage.getItem("opentask-theme-preference")).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
