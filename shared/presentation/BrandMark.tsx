import Image from "next/image";

import styles from "./BrandMark.module.css";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brand} role="img" aria-label="Omplish">
      <span className={styles.mark} aria-hidden="true">
        <Image
          alt=""
          className={compact ? styles.markCompact : undefined}
          height={30}
          src="/branding/omplish.png"
          width={30}
        />
      </span>
      {!compact && <span className={styles.wordmark}>Omplish</span>}
    </span>
  );
}
