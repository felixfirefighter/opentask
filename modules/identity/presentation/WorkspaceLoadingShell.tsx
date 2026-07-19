import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/shared/presentation";

import styles from "./WorkspaceLoadingShell.module.css";

export function WorkspaceLoadingShell({
  detail = false,
  label = "Opening your workspace…",
}: Readonly<{ detail?: boolean; label?: string }>) {
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
        <BrandMark />
        <LoadingLines count={5} />
      </aside>
      <header className={styles.topBar}>
        <Link href="/inbox" aria-label="OpenTask inbox">
          <BrandMark compact />
        </Link>
      </header>
      <main className={styles.main} id="loading-main" tabIndex={-1} aria-busy="true">
        <section className={styles.content} aria-label="Workspace content loading">
          {detail ? (
            <Link className={styles.back} href="/inbox" aria-label="Back to task list">
              <ChevronLeft size={20} aria-hidden="true" />
              <span>Back to tasks</span>
            </Link>
          ) : null}
          <p className={styles.status} role="status">
            {label}
          </p>
          <LoadingLines count={4} wide />
        </section>
      </main>
      <nav className={styles.mobileNav} aria-label="Mobile navigation loading" aria-hidden="true">
        <span />
        <span />
        <span />
      </nav>
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
