import { render } from "@testing-library/react";
import { vi } from "vitest";

import { todayFixture } from "./planning-screen-fixtures";
import { TodayScreen, type TodayScreenProps } from "./TodayScreen";

export function renderToday(overrides: Partial<TodayScreenProps> = {}) {
  const props: TodayScreenProps = {
    model: todayFixture,
    condition: { kind: "ready" },
    quickAdd: {
      value: "Call Sam tomorrow at 3pm",
      destinationLabel: "Today",
      tokens: [{ id: "when", label: "Tomorrow, 3:00 PM" }],
    },
    taskActions: {},
    calendarHref: "/calendar",
    upcomingHref: "/upcoming",
    onQuickAddChange: vi.fn(),
    onQuickAddSubmit: vi.fn(),
    ...overrides,
  };
  return render(<TodayScreen {...props} />);
}
