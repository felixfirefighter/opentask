import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignOutButton } from "./SignOutButton";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SignOutButton", () => {
  it("clears private query data before leaving the authenticated app", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    for (const key of [
      ["tasks", "list"],
      ["tasks", "detail", "task_01"],
      ["tasks", "search", "private"],
      ["lists", "navigation"],
    ]) {
      queryClient.setQueryData(key, { title: "User A private data" });
    }
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries");
    const onSignedOut = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <SignOutButton onSignedOut={onSignedOut} />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });
});
