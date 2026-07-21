import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmUnsavedNavigation, useUnsavedNavigationGuard } from "./unsaved-navigation";

afterEach(() => vi.restoreAllMocks());

describe("unsaved navigation", () => {
  it("preserves every active draft when any guard chooses Stay and discards only after all choose Leave", () => {
    const discardFirst = vi.fn();
    const discardSecond = vi.fn();
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    render(<GuardHarness discardFirst={discardFirst} discardSecond={discardSecond} />);

    expect(confirmUnsavedNavigation()).toBe(false);
    expect(discardFirst).not.toHaveBeenCalled();
    expect(discardSecond).not.toHaveBeenCalled();

    act(() => expect(confirmUnsavedNavigation()).toBe(true));
    expect(discardFirst).toHaveBeenCalledOnce();
    expect(discardSecond).toHaveBeenCalledOnce();
    expect(confirm.mock.calls.map(([message]) => message)).toEqual([
      "Discard first draft?",
      "Discard second draft?",
      "Discard first draft?",
      "Discard second draft?",
    ]);
  });
});

function GuardHarness({
  discardFirst,
  discardSecond,
}: Readonly<{ discardFirst: () => void; discardSecond: () => void }>) {
  useUnsavedNavigationGuard(true, "Discard first draft?", discardFirst);
  useUnsavedNavigationGuard(true, "Discard second draft?", discardSecond);
  return null;
}
