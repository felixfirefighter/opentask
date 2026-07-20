"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { BrandMark } from "@/shared/presentation";

import { AuthForm } from "./AuthForm";
import styles from "./AuthScreen.module.css";
import { alternateAuthHref, type AuthMode } from "./auth-form-contract";

type Navigate = (destination: string) => void;

export function AuthScreen({
  mode,
  returnTo,
  navigate,
}: {
  mode: AuthMode;
  returnTo?: string | null | undefined;
  navigate?: Navigate | undefined;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = screenCopy(mode);

  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className={styles.page} data-auth-mode={mode}>
      <a className="skip-link" href="#auth-content">
        Skip to main content
      </a>
      <main className={styles.main} id="auth-content">
        <section className={styles.card} aria-labelledby="auth-heading" aria-describedby="auth-orientation">
          <Link className={styles.brandLink} href="/" aria-label="OpenTask home">
            <BrandMark />
          </Link>
          <div className={styles.headingGroup}>
            <h1 id="auth-heading" ref={headingRef} tabIndex={-1}>
              {copy.heading}
            </h1>
            <p id="auth-orientation">{copy.orientation}</p>
          </div>

          <AuthForm mode={mode} returnTo={returnTo} navigate={navigate} />

          <div className={styles.alternateActions}>
            <p>
              {copy.alternateLead}{" "}
              <Link href={alternateAuthHref(mode, returnTo)}>{copy.alternateAction}</Link>
            </p>
            <Link className={styles.demoLink} href="/">
              Try demo
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function screenCopy(mode: AuthMode) {
  if (mode === "sign-in") {
    return {
      heading: "Welcome back",
      orientation: "Sign in to return to your private planning workspace.",
      alternateLead: "New to OpenTask?",
      alternateAction: "Create an account",
    };
  }
  return {
    heading: "Create your account",
    orientation: "Start with a private Inbox and plan manually with or without AI.",
    alternateLead: "Already have an account?",
    alternateAction: "Sign in",
  };
}
