"use client";

import { FocusScreen } from "./FocusScreen";
import type { FocusPresentationActions } from "./focus-screen-model";

const noAction = () => undefined;
const confirmAction = async () => true;
const actions: FocusPresentationActions = {
  onModeChange: noAction,
  onFocusDurationChange: noAction,
  onBreakDurationChange: noAction,
  onLinkChange: noAction,
  onLinkSearch: noAction,
  onStartFocus: noAction,
  onStartBreak: noAction,
  onPause: noAction,
  onResume: noAction,
  onFinish: noAction,
  onDiscard: noAction,
  onCorrect: confirmAction,
  onDelete: noAction,
  onRetryActive: noAction,
  onRetrySummary: noAction,
  onRetryHistory: noAction,
};

export function FocusRouteLoadingScreen() {
  return (
    <FocusScreen
      actions={actions}
      active={{ kind: "loading" }}
      history={{ kind: "loading" }}
      linkSearch={{ query: "", options: [], status: "idle" }}
      summary={{ kind: "loading" }}
    />
  );
}
