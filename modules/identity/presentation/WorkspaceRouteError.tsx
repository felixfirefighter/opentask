"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import styles from "./WorkspaceRouteError.module.css";

export function WorkspaceRouteError({
  eyebrow = "Workspace",
  error,
  message = "Your data was not changed. Try loading the view again.",
  onRetry,
  returnHref,
  returnLabel = "Close view",
  title = "Something interrupted this view",
}: Readonly<{
  eyebrow?: string;
  error: Error & { digest?: string };
  message?: string;
  onRetry: () => void;
  returnHref?: string;
  returnLabel?: string;
  title?: string;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Next records the full server error; only its opaque digest is acknowledged here.
    void error.digest;
    headingRef.current?.focus();
  }, [error]);

  return (
    <main className={styles.routeState}>
      <div className={styles.stateCard} role="alert">
        <span className={styles.stateIcon} aria-hidden="true">
          <CircleAlert size={20} />
        </span>
        <p className="eyebrow">{eyebrow}</p>
        <h1 ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        <p>{message}</p>
        <div className={styles.actions}>
          <button className="primary-button" type="button" onClick={onRetry}>
            Try again
          </button>
          {returnHref ? (
            <Link className="secondary-button" href={returnHref}>
              {returnLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
