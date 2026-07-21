export function HabitFreshnessAnnouncement({ announcement }: Readonly<{ announcement: string }>) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {announcement}
    </span>
  );
}
