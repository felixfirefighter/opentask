"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const WORKSPACE_CHANGED_EVENT = "opentask:workspace-data-changed";
const MAX_TRACKED_ROUTES = 32;
let workspaceRevision = 0;
const consumedRevisionByRoute = new Map<string, number>();

export function markWorkspaceRoutesStale() {
  workspaceRevision += 1;
  window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
}

export function WorkspaceRouteFreshness() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [historySignal, setHistorySignal] = useState(0);
  const routeKey = `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    const signalRouteCheck = () => setHistorySignal((current) => current + 1);

    window.addEventListener("popstate", signalRouteCheck);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, signalRouteCheck);
    return () => {
      window.removeEventListener("popstate", signalRouteCheck);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, signalRouteCheck);
    };
  }, []);

  useEffect(() => {
    if (workspaceRevision <= (consumedRevisionByRoute.get(routeKey) ?? 0)) return;
    const pendingRevision = workspaceRevision;
    const frame = window.requestAnimationFrame(() => {
      const browserSearch = new URLSearchParams(window.location.search).toString();
      const browserRoute = `${window.location.pathname}${browserSearch ? `?${browserSearch}` : ""}`;
      if (browserRoute !== routeKey) {
        setHistorySignal((current) => current + 1);
        return;
      }
      rememberConsumedRevision(routeKey, pendingRevision);
      router.refresh();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [historySignal, routeKey, router]);

  return null;
}

function rememberConsumedRevision(routeKey: string, revision: number) {
  consumedRevisionByRoute.delete(routeKey);
  consumedRevisionByRoute.set(routeKey, revision);
  while (consumedRevisionByRoute.size > MAX_TRACKED_ROUTES) {
    const oldestRoute = consumedRevisionByRoute.keys().next().value;
    if (oldestRoute === undefined) break;
    consumedRevisionByRoute.delete(oldestRoute);
  }
}
