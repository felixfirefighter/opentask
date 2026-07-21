import { onlineManager, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppClientProviders } from "./AppClientProviders";

vi.mock("./pwa/PwaProvider", () => ({
  PwaProvider: ({ children }: Readonly<{ children: ReactNode }>) => children,
}));

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe("AppClientProviders", () => {
  it("configures mutations to execute once without an offline pause queue", () => {
    let client: QueryClient | undefined;

    function ReadClient() {
      client = useQueryClient();
      return null;
    }

    render(
      <AppClientProviders>
        <ReadClient />
      </AppClientProviders>,
    );

    expect(client?.getDefaultOptions().mutations).toMatchObject({
      networkMode: "always",
      retry: false,
    });
  });

  it("fails an offline mutation immediately and never replays it after reconnection", async () => {
    const user = userEvent.setup();
    const mutationFn = vi.fn(async () => {
      throw new TypeError("offline");
    });
    onlineManager.setOnline(false);

    function MutationProbe() {
      const mutation = useMutation({ mutationFn });
      return (
        <>
          <button type="button" onClick={() => mutation.mutate()}>
            Attempt write
          </button>
          <span>{mutation.status}</span>
        </>
      );
    }

    render(
      <AppClientProviders>
        <MutationProbe />
      </AppClientProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Attempt write" }));
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    await screen.findByText("error");

    act(() => onlineManager.setOnline(true));
    await Promise.resolve();
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});
