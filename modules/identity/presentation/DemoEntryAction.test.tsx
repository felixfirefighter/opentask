import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoEntryAction } from "./DemoEntryAction";

describe("DemoEntryAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a non-simple JSON mutation request and blocks duplicate entry", async () => {
    const fetchRequest = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchRequest);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const user = userEvent.setup();

    render(<DemoEntryAction />);
    const action = screen.getByRole("button", { name: "Try demo" });
    await user.click(action);

    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(fetchRequest).toHaveBeenCalledWith("/api/v1/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(screen.getByRole("button", { name: "Preparing demo…" })).toBeDisabled();
    expect(screen.getByText("Preparing an isolated demo workspace…")).toBeInTheDocument();
  });
});
