"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const WORKSPACE_CHANGED_EVENT = "opentask:workspace-data-changed";
let workspaceRevision = 0;
let consumedRevision = 0;

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
    const markHistoryNavigation = () => {
      workspaceRevision += 1;
      setHistorySignal((current) => current + 1);
    };

    window.addEventListener("popstate", markHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", markHistoryNavigation);
    };
  }, []);

  useEffect(() => {
    if (workspaceRevision <= consumedRevision) return;
    const pendingRevision = workspaceRevision;
    const frame = window.requestAnimationFrame(() => {
      const browserRoute = `${window.location.pathname}${window.location.search}`;
      if (browserRoute !== routeKey) {
        setHistorySignal((current) => current + 1);
        return;
      }
      consumedRevision = Math.max(consumedRevision, pendingRevision);
      router.refresh();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [historySignal, routeKey, router]);

  return null;
}
