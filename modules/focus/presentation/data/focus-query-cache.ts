import type { QueryClient } from "@tanstack/react-query";

import type { FocusTimerSnapshot } from "../../application/contracts";
import { focusQueryKeys } from "./focus-query-keys";

export function setActiveSnapshot(client: QueryClient, snapshot: FocusTimerSnapshot | null) {
  client.setQueryData(focusQueryKeys.active(), snapshot);
}

export function refreshCompletedFocusReads(client: QueryClient) {
  void client.invalidateQueries({ queryKey: focusQueryKeys.summary() });
  void client.invalidateQueries({ queryKey: focusQueryKeys.history() });
}
