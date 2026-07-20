"use client";

import { usePathname, useRouter } from "next/navigation";
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
  const [historySignal, setHistorySignal] = useState(0);

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
    consumedRevision = workspaceRevision;
    router.refresh();
  }, [historySignal, pathname, router]);

  return null;
}
