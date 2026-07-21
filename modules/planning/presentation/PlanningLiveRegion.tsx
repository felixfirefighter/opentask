export function PlanningLiveRegion({ messages }: Readonly<{ messages: readonly string[] }>) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {messages.filter(Boolean).join(" ")}
    </p>
  );
}
