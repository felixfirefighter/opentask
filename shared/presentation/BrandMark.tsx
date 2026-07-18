import { Check } from "lucide-react";

import styles from "./BrandMark.module.css";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brand} role="img" aria-label="OpenTask">
      <span className={styles.mark} aria-hidden="true">
        <Check size={compact ? 15 : 17} strokeWidth={3} />
      </span>
      {!compact && <span className={styles.wordmark}>OpenTask</span>}
    </span>
  );
}
