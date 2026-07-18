"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import styles from "./AccountMenu.module.css";

type SignOutState = "idle" | "pending" | "error";

export function SignOutButton() {
  const [state, setState] = useState<SignOutState>("idle");

  async function signOut() {
    if (state === "pending") return;
    setState("pending");

    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Sign-out request failed");
      window.location.assign("/sign-in");
    } catch {
      setState("error");
    }
  }

  return (
    <div className={styles.signOutGroup} role="none">
      <button
        className={styles.menuItem}
        type="button"
        role="menuitem"
        disabled={state === "pending"}
        onClick={signOut}
      >
        <LogOut size={17} aria-hidden="true" />
        <span>{state === "pending" ? "Signing out…" : "Sign out"}</span>
      </button>
      {state === "error" && (
        <p className={styles.menuError} role="alert">
          Sign out failed. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
