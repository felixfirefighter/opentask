"use client";

import type { FocusTimerSnapshot } from "../application/contracts";
import { FocusScreen } from "./FocusScreen";
import { useFocusController } from "./use-focus-controller";

export function FocusRouteScreen({
  hourCycle,
  initialActive,
  timeZone,
}: Readonly<{
  hourCycle: "h12" | "h23";
  initialActive?: FocusTimerSnapshot | null;
  timeZone: string;
}>) {
  const screen = useFocusController({
    hourCycle,
    ...(initialActive !== undefined ? { initialActive } : {}),
    timeZone,
  });
  return <FocusScreen {...screen} />;
}
