"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";

import {
  Button,
  fetchWithConnectivity,
  retryConnectivity,
  useConnectivityStatus,
} from "@/shared/presentation";

export function DemoEntryAction() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const connectivity = useConnectivityStatus();
  const online = connectivity === "online";

  async function enterDemo() {
    if (!online || status === "loading") return;
    setStatus("loading");
    setMessage("Preparing an isolated demo workspace…");

    try {
      const response = await fetchWithConnectivity("/api/v1/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Demo entry failed");
      const result = (await response.json()) as { redirectTo?: unknown };
      if (result.redirectTo !== "/inbox") throw new Error("Unexpected demo destination");
      window.location.assign("/inbox");
    } catch (error) {
      if (error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError")) {
        setStatus("idle");
        setMessage("");
        return;
      }
      setStatus("error");
      setMessage("No demo workspace was opened. Try again or create your own account.");
    }
  }

  const checking = connectivity === "recovering";
  const retrying = connectivity === "network-unreachable" || checking;

  return (
    <div className="demo-entry-action">
      <Button
        type="button"
        variant="secondary"
        disabled={connectivity === "browser-offline" || checking || status === "loading"}
        onClick={retrying ? () => void retryConnectivity() : enterDemo}
      >
        {checking
          ? "Checking…"
          : retrying
            ? "Try connection"
            : status === "loading"
              ? "Preparing demo…"
              : "Try demo"}
        {!checking && !retrying && status !== "loading" && <ArrowRight size={17} aria-hidden="true" />}
      </Button>
      <p aria-live="polite" className="demo-entry-status">
        {connectivityMessage(connectivity) ||
          message ||
          "Creates or resets an isolated demo workspace for this visitor."}
      </p>
    </div>
  );
}

function connectivityMessage(connectivity: ReturnType<typeof useConnectivityStatus>) {
  if (connectivity === "browser-offline") {
    return "A connection is required to create an isolated demo.";
  }
  if (connectivity === "network-unreachable") {
    return "OpenTask can’t reach the server. Check the connection and try again.";
  }
  if (connectivity === "recovering") {
    return "Checking the connection before opening a demo workspace.";
  }
  return null;
}
