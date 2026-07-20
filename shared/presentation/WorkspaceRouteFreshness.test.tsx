import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markWorkspaceRoutesStale, WorkspaceRouteFreshness } from "./WorkspaceRouteFreshness";

const navigation = vi.hoisted(() => ({ pathname: "/today", refresh: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

afterEach(() => {
  navigation.pathname = "/today";
  navigation.search = "";
  window.history.replaceState({}, "", "/today");
  navigation.refresh.mockReset();
});

beforeEach(() => {
  navigation.pathname = "/today";
  navigation.search = "";
  window.history.replaceState({}, "", "/today");
  navigation.refresh.mockReset();
});

describe("WorkspaceRouteFreshness", () => {
  it("refreshes every stale route once after a workspace mutation, including browser Back", async () => {
    const view = render(<WorkspaceRouteFreshness />);

    act(() => markWorkspaceRoutesStale());
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));

    navigation.pathname = "/calendar";
    window.history.replaceState({}, "", "/calendar");
    view.rerender(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(2));

    navigation.pathname = "/upcoming";
    window.history.replaceState({}, "", "/upcoming");
    view.rerender(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(3));

    act(() => markWorkspaceRoutesStale());
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(4));

    act(() => {
      window.history.replaceState({}, "", "/today?from=history");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(navigation.refresh).toHaveBeenCalledTimes(4);

    navigation.pathname = "/today";
    navigation.search = "from=history";
    view.rerender(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(5));

    navigation.pathname = "/calendar";
    navigation.search = "";
    window.history.replaceState({}, "", "/calendar");
    view.rerender(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(6));

    view.unmount();
    markWorkspaceRoutesStale();
    expect(navigation.refresh).toHaveBeenCalledTimes(6);

    navigation.pathname = "/today";
    navigation.search = "";
    window.history.replaceState({}, "", "/today");
    const remounted = render(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(7));
    remounted.unmount();
  });

  it("bounds route bookkeeping and conservatively refreshes an evicted route again", async () => {
    const view = render(<WorkspaceRouteFreshness />);
    act(() => markWorkspaceRoutesStale());
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));

    for (let index = 0; index < 36; index += 1) {
      navigation.pathname = `/audit-route-${index}`;
      window.history.replaceState({}, "", navigation.pathname);
      view.rerender(<WorkspaceRouteFreshness />);
      await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(index + 2));
    }

    navigation.pathname = "/today";
    window.history.replaceState({}, "", "/today");
    view.rerender(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(38));
  });

  it("treats percent-equivalent query serialization as the same browser route", async () => {
    navigation.search = "q=a%20b";
    window.history.replaceState({}, "", "/today?q=a%20b");
    render(<WorkspaceRouteFreshness />);

    act(() => markWorkspaceRoutesStale());
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });
});
