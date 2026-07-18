import type { ReactNode } from "react";

import styles from "./VisualProofShell.module.css";
import { VisualProofNavigation, type ActiveDestination } from "./VisualProofNavigation";

export function VisualProofShell({
  active,
  children,
  inspector,
}: {
  active: ActiveDestination;
  children: ReactNode;
  inspector?: ReactNode;
}) {
  return (
    <div className={`${styles.shell} ${inspector ? styles.withInspector : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <VisualProofNavigation active={active} />

      <main id="main-content" className={styles.main}>
        {children}
      </main>

      {inspector && (
        <aside className={styles.inspector} aria-label="Task details">
          {inspector}
        </aside>
      )}
    </div>
  );
}
