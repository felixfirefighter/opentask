import {
  FOCUS_RECORDED_SECONDS_MAX,
  type FocusHistoryItemDto,
  type FocusHistoryPage,
  type FocusHistoryLink,
  type FocusResolvedLink,
  type FocusSummary,
  type FocusTimerSnapshot,
} from "../application/contracts";
import type {
  FocusHistoryItemView,
  FocusHistoryView,
  FocusLinkOption,
  FocusLinkView,
  FocusSummaryView,
  FocusTimerView,
} from "./focus-screen-model";

export function focusTimerView(
  snapshot: FocusTimerSnapshot | null,
  setup: Readonly<{
    mode: "pomodoro" | "stopwatch";
    focusPlannedSeconds: number;
    breakPlannedSeconds: number;
    link: FocusLinkView | null;
  }>,
  projectedElapsedSeconds: number,
): FocusTimerView {
  if (snapshot === null || snapshot.session.state === "completed") {
    return { kind: "idle", ...setup };
  }

  return {
    kind: "session",
    id: snapshot.session.id,
    version: snapshot.session.version,
    phase: snapshot.session.kind,
    mode: snapshot.session.mode,
    status: snapshot.session.state === "paused" ? "paused" : "running",
    displayedElapsedSeconds: Math.min(
      FOCUS_RECORDED_SECONDS_MAX,
      snapshot.elapsedActiveSeconds +
        (snapshot.session.state === "active" ? Math.max(0, projectedElapsedSeconds) : 0),
    ),
    plannedSeconds: snapshot.session.plannedSeconds,
    link: timerLink(snapshot),
  };
}

export function focusSummaryView(
  data: FocusSummary | undefined,
  pending: boolean,
  error: unknown,
): FocusSummaryView {
  if (error) {
    return {
      kind: "error",
      message: "Saved Focus totals could not be loaded.",
      ...(data
        ? {
            cached: {
              todaySeconds: data.todaySeconds,
              sevenDaySeconds: data.sevenDaySeconds,
            },
          }
        : {}),
    };
  }
  if (data) {
    return {
      kind: "ready",
      todaySeconds: data.todaySeconds,
      sevenDaySeconds: data.sevenDaySeconds,
    };
  }
  return pending ? { kind: "loading" } : { kind: "error", message: "Saved Focus totals are unavailable." };
}

export function focusHistoryView(
  data: FocusHistoryPage | undefined,
  pending: boolean,
  error: unknown,
  timeZone: string,
  hourCycle: "h12" | "h23",
): FocusHistoryView {
  const items = data?.items.map((item) => focusHistoryItemView(item, timeZone, hourCycle));
  if (error) {
    return {
      kind: "error",
      title:
        typeof error === "string" ? "History change was not confirmed" : "Focus history could not be loaded",
      message: typeof error === "string" ? error : "Saved Focus history could not be loaded.",
      ...(items ? { items } : {}),
    };
  }
  if (items) return { kind: "ready", items };
  return pending ? { kind: "loading" } : { kind: "error", message: "Saved Focus history is unavailable." };
}

export function focusLinkOptions(
  links: readonly Readonly<{
    id: string;
    kind: "task" | "habit";
    label: string | null;
    available: boolean;
  }>[] = [],
): readonly FocusLinkOption[] {
  return links.flatMap((link) =>
    link.available && link.label
      ? [{ id: link.id, kind: link.kind, label: link.label, available: true as const }]
      : [],
  );
}

function timerLink(snapshot: FocusTimerSnapshot): FocusLinkView | null {
  if (snapshot.link) return historyLinkView(snapshot.link);
  return null;
}

function focusHistoryItemView(
  item: FocusHistoryItemDto,
  timeZone: string,
  hourCycle: "h12" | "h23",
): FocusHistoryItemView {
  const endedAt = item.session.endedAt;
  if (endedAt === null) throw new Error("A completed Focus history item requires an end time.");
  return {
    id: item.session.id,
    version: item.session.version,
    kind: item.session.kind,
    mode: item.session.mode,
    completedAtLabel: new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
      hourCycle,
    }).format(new Date(endedAt)),
    durationSeconds: item.session.accumulatedActiveSeconds,
    link: item.link ? historyLinkView(item.link) : null,
  };
}

function historyLinkView(link: FocusHistoryLink | FocusResolvedLink): FocusLinkView {
  return {
    id: link.id,
    kind: link.kind,
    label: link.label,
    available: link.availability === "available" && link.label !== null,
  };
}
