"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { Button, useOnlineStatus } from "@/shared/presentation";

export function DemoEntryAction() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const online = useOnlineStatus();

  async function enterDemo() {
    if (!online || status === "loading") return;
    setStatus("loading");
    setMessage("Preparing an isolated demo workspace…");

    try {
      const response = await fetch("/api/v1/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Demo entry failed");
      const result = (await response.json()) as { redirectTo?: unknown };
      if (result.redirectTo !== "/inbox") throw new Error("Unexpected demo destination");
      window.location.assign("/inbox");
    } catch {
      setStatus("error");
      setMessage("No demo workspace was opened. Try again or create your own account.");
    }
  }

  return (
    <div className="demo-entry-action">
      <Button
        type="button"
        variant="secondary"
        disabled={!online || status === "loading"}
        onClick={enterDemo}
      >
        {status === "loading" ? "Preparing demo…" : "Try demo"}
        {status !== "loading" && <ArrowRight size={17} aria-hidden="true" />}
      </Button>
      <p aria-live="polite" className="demo-entry-status">
        {!online
          ? "A connection is required to create an isolated demo."
          : message || "Creates or resets an isolated demo workspace for this visitor."}
      </p>
    </div>
  );
}
