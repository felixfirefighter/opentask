"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function RouteFocus() {
  const pathname = usePathname();

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && activeElement !== document.documentElement)
      return;
    document.querySelector<HTMLElement>("[data-route-focus]")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
