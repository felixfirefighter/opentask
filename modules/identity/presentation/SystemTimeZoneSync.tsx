"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { userPreferencesSchema } from "../application/preferences-contract";

export function SystemTimeZoneSync() {
  const router = useRouter();

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;

    const controller = new AbortController();

    async function synchronize() {
      try {
        const currentResponse = await fetch("/api/v1/preferences", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!currentResponse.ok) return;

        const current = userPreferencesSchema.parse(await currentResponse.json());
        if (current.timezone === timeZone) return;

        const updateResponse = await fetch("/api/v1/preferences", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: current.version,
            patch: { timezone: timeZone },
          }),
          signal: controller.signal,
        });
        if (updateResponse.ok && !controller.signal.aborted) router.refresh();
      } catch {
        // A missing connection or unsupported browser timezone must not block the workspace.
      }
    }

    void synchronize();
    return () => controller.abort();
  }, [router]);

  return null;
}
