"use client";

import { useEffect, useState } from "react";

export function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value.trim());
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value.trim()), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}
