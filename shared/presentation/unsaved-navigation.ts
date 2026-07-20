"use client";

import { useEffect, useRef } from "react";

type UnsavedNavigationGuard = Readonly<{
  discard: () => void;
  isActive: () => boolean;
  message: string;
}>;

const guards = new Set<UnsavedNavigationGuard>();
let listenersInstalled = false;
let restoringHistory = false;

export function confirmUnsavedNavigation(): boolean {
  const activeGuards = [...guards].filter((guard) => guard.isActive());
  for (const guard of activeGuards) {
    if (!window.confirm(guard.message)) return false;
  }
  for (const guard of activeGuards) guard.discard();
  return true;
}

export function useUnsavedNavigationGuard(
  active: boolean,
  confirmMessage: string,
  onDiscard: () => void,
): void {
  const activeRef = useRef(active);
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    activeRef.current = active;
    onDiscardRef.current = onDiscard;
  }, [active, onDiscard]);

  useEffect(() => {
    const guard: UnsavedNavigationGuard = {
      discard() {
        activeRef.current = false;
        onDiscardRef.current();
      },
      isActive: () => activeRef.current,
      message: confirmMessage,
    };
    guards.add(guard);
    installGlobalListeners();
    return () => {
      guards.delete(guard);
      uninstallGlobalListenersWhenIdle();
    };
  }, [confirmMessage]);
}

function installGlobalListeners() {
  if (listenersInstalled) return;
  window.addEventListener("beforeunload", preventUnsavedExit);
  document.addEventListener("click", guardLinkNavigation, true);
  window.addEventListener("popstate", guardHistoryNavigation);
  listenersInstalled = true;
}

function uninstallGlobalListenersWhenIdle() {
  if (guards.size > 0 || !listenersInstalled) return;
  window.removeEventListener("beforeunload", preventUnsavedExit);
  document.removeEventListener("click", guardLinkNavigation, true);
  window.removeEventListener("popstate", guardHistoryNavigation);
  listenersInstalled = false;
  restoringHistory = false;
}

function hasActiveGuard() {
  return [...guards].some((guard) => guard.isActive());
}

function preventUnsavedExit(event: BeforeUnloadEvent) {
  if (!hasActiveGuard()) return;
  event.preventDefault();
  event.returnValue = "";
}

function guardLinkNavigation(event: MouseEvent) {
  if (
    !hasActiveGuard() ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
  if (!confirmUnsavedNavigation()) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function guardHistoryNavigation() {
  if (restoringHistory) {
    restoringHistory = false;
    return;
  }
  if (!hasActiveGuard() || confirmUnsavedNavigation()) return;
  restoringHistory = true;
  window.history.forward();
}
