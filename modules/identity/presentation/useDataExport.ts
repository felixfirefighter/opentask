"use client";

import { useRef, useState } from "react";

type ExportState = "idle" | "exporting" | "downloaded" | "error";

export function useDataExport(online: boolean) {
  const [state, setState] = useState<ExportState>("idle");
  const [message, setMessage] = useState<string>();
  const inFlight = useRef(false);

  async function download() {
    if (!online || inFlight.current) return;
    inFlight.current = true;
    setState("exporting");
    setMessage("Preparing your private export…");

    try {
      const response = await fetch("/api/v1/export", { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error("Export request failed.");
      const filename = readFilename(response.headers) ?? "opentask-export.json";
      const schemaVersion = response.headers.get("x-opentask-export-schema-version");
      downloadBlob(await response.blob(), filename);
      setState("downloaded");
      setMessage(
        schemaVersion ? `Downloaded ${filename} · schema v${schemaVersion}.` : `Downloaded ${filename}.`,
      );
    } catch {
      setState("error");
      setMessage("No export file was downloaded. Check your connection and try again.");
    } finally {
      inFlight.current = false;
    }
  }

  return { download, message, state } as const;
}

function readFilename(headers: Headers): string | null {
  const value = headers.get("content-disposition");
  const match = value?.match(/filename="([A-Za-z0-9._-]+)"/u);
  return match?.[1] ?? null;
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
