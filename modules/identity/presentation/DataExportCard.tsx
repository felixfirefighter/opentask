import styles from "./SettingsScreen.module.css";
import { useDataExport } from "./useDataExport";

export function DataExportCard({ online }: { online: boolean }) {
  const exporter = useDataExport(online);

  return (
    <section className={styles.card} aria-labelledby="data-export-title">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">Portability</p>
          <h2 id="data-export-title">Your data</h2>
        </div>
      </div>
      <p className={styles.cardDescription}>
        Download a versioned JSON copy of your profile, preferences, tasks, organization, schedules, habits,
        check-ins, completed Focus sessions, and planner proposals. Passwords, sessions, provider keys, and
        raw brain dumps are never included.
      </p>
      <div className={styles.cardActions}>
        <p className={styles.saveStatus} aria-live="polite">
          {!online ? "Offline · reconnect before requesting an export." : exporter.message}
        </p>
        <button
          type="button"
          className="primary-button"
          disabled={!online || exporter.state === "exporting"}
          onClick={exporter.download}
        >
          {exporter.state === "exporting" ? "Preparing export…" : "Export my data"}
        </button>
      </div>
    </section>
  );
}
