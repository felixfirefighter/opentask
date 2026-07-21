import { describe, expect, it } from "vitest";

import { runningFocusTimer } from "./focus-presentation-test-support";
import { focusTimerDisplay, formatFocusDuration } from "./focus-time-format";

describe("Focus time presentation", () => {
  it("shows Pomodoro remaining time and switches to explicit overtime at zero", () => {
    expect(focusTimerDisplay(runningFocusTimer({ displayedElapsedSeconds: 1_499 }))).toMatchObject({
      overtime: false,
      text: "00:01",
    });
    expect(focusTimerDisplay(runningFocusTimer({ displayedElapsedSeconds: 1_500 }))).toMatchObject({
      label: "0 seconds overtime",
      overtime: true,
      text: "+00:00",
    });
    expect(focusTimerDisplay(runningFocusTimer({ displayedElapsedSeconds: 1_561 }))).toMatchObject({
      overtime: true,
      text: "+01:01",
    });
  });

  it("shows a stopwatch as elapsed time without a planned boundary", () => {
    expect(
      focusTimerDisplay(
        runningFocusTimer({ mode: "stopwatch", plannedSeconds: null, displayedElapsedSeconds: 3_661 }),
      ),
    ).toEqual({
      durationSeconds: 3_661,
      label: "1 hour 1 minute 1 second elapsed",
      overtime: false,
      text: "01:01:01",
    });
  });

  it("formats summary and history durations without implying second precision", () => {
    expect(formatFocusDuration(20)).toBe("Less than 1 min");
    expect(formatFocusDuration(3_900)).toBe("1 hr 5 min");
  });
});
