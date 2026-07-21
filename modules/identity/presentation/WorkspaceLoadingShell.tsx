import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/shared/presentation";

import styles from "./WorkspaceLoadingShell.module.css";

export function WorkspaceLoadingShell({
  children,
  detail = false,
  label = "Opening your workspace…",
  returnHref = "/inbox",
}: Readonly<{ children?: ReactNode; detail?: boolean; label?: string; returnHref?: string }>) {
  return (
    <div className={styles.shell} aria-busy="true">
      <a className="skip-link" href="#loading-main">
        Skip to main content
      </a>
      <nav className={styles.rail} aria-label="Primary navigation">
        <Link href="/inbox" aria-label="OpenTask inbox">
          <BrandMark compact />
        </Link>
      </nav>
      <aside className={styles.sidebar} aria-label="Workspace navigation loading">
        <div className={styles.sidebarHeader}>
          <p>Opening</p>
          <strong>Your workspace</strong>
        </div>
        <LoadingLines count={5} />
      </aside>
      <header className={styles.topBar}>
        <Link href="/inbox" aria-label="OpenTask inbox">
          <BrandMark compact />
          <strong>Workspace</strong>
        </Link>
      </header>
      <main className={styles.main} id="loading-main" tabIndex={-1} aria-busy="true">
        {children ? (
          <>
            {children}
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {label}
            </span>
          </>
        ) : (
          <section className={styles.content} aria-label="Workspace content loading">
            {detail ? (
              <Link className={styles.back} href={returnHref} aria-label="Back to task list">
                <ChevronLeft size={20} aria-hidden="true" />
                <span>Back to tasks</span>
              </Link>
            ) : null}
            <h1 className={styles.status} tabIndex={-1}>
              {label}
            </h1>
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {label}
            </span>
            {detail ? <DetailLoadingFields /> : <LoadingLines count={4} wide />}
          </section>
        )}
      </main>
      <nav className={styles.mobileNav} aria-label="Mobile navigation loading" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </nav>
    </div>
  );
}

function DetailLoadingFields() {
  return (
    <div className={styles.detailFields} data-loading-shape="task-detail" aria-hidden="true">
      <span className={styles.detailTitle} />
      {Array.from({ length: 5 }, (_, index) => (
        <span className={styles.detailField} key={index} />
      ))}
    </div>
  );
}

function LoadingLines({ count, wide = false }: Readonly<{ count: number; wide?: boolean }>) {
  return (
    <div className={styles.lines} data-wide={wide || undefined} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
