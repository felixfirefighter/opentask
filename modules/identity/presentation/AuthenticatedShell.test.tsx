import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedShell } from "./AuthenticatedShell";

const identity = {
  actor: { userId: "user_01" },
  displayName: "Ada Lovelace",
  email: "ada@example.com",
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthenticatedShell", () => {
  it("renders only release destinations in a stable landmark order", () => {
    renderShell();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    const rail = screen.getByRole("navigation", { name: "Primary navigation" });
    const account = screen.getAllByRole("button", { name: /Open account actions/ })[0];
    const context = screen.getByRole("complementary", { name: "Inbox navigation" });
    const main = screen.getByRole("main");
    const topBar = document.querySelector("header");
    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });

    expect(skip).toHaveAttribute("href", "#main-content");
    expect(account).toBeDefined();
    expect(topBar).not.toBeNull();
    expect(precedes(skip, rail)).toBe(true);
    expect(precedes(rail, account!)).toBe(true);
    expect(precedes(account!, context)).toBe(true);
    expect(precedes(context, main)).toBe(true);
    expect(precedes(topBar!, main)).toBe(true);
    expect(precedes(main, mobile)).toBe(true);
    expect(screen.queryByRole("link", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Calendar" })).not.toBeInTheDocument();
    expect(screen.queryByText(/fixture/i)).not.toBeInTheDocument();
  });

  it("supports keyboard navigation and focus return for account actions", async () => {
    const user = userEvent.setup();
    renderShell("settings");
    const trigger = screen.getAllByRole("button", { name: /Open account actions/ })[0]!;

    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Account actions" });
    const settings = within(menu).getByRole("menuitem", { name: "Settings" });
    const signOut = within(menu).getByRole("menuitem", { name: "Sign out" });

    expect(settings).toHaveAttribute("aria-current", "page");
    expect(settings).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(signOut).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu", { name: "Account actions" })).not.toBeInTheDocument();
  });

  it("posts sign-out and keeps a recoverable error inside the account menu", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    renderShell();

    await user.click(screen.getAllByRole("button", { name: /Open account actions/ })[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out failed");
  });

  it("announces offline state and removes the banner after reconnection", async () => {
    let online = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
    renderShell();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    online = false;
    act(() => window.dispatchEvent(new Event("offline")));
    expect(await screen.findByRole("status")).toHaveTextContent("Writes are disabled");

    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});

function renderShell(currentDestination: "inbox" | "settings" = "inbox") {
  return render(
    <AuthenticatedShell
      identity={identity}
      theme="light"
      reducedMotion={false}
      currentDestination={currentDestination}
    >
      <h1>Release workspace</h1>
    </AuthenticatedShell>,
  );
}

function precedes(first: Node, second: Node) {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}
