"use client";

import { useEffect } from "react";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  useEffect(() => {
    // Next.js records the full server error; do not render private details into the page.
    void error.digest;
  }, [error]);

  return (
    <main className="workspace-route-state">
      <div role="alert">
        <p className="eyebrow">Workspace</p>
        <h1>Something interrupted this view</h1>
        <p>Your data was not changed. Try loading the view again.</p>
        <button className="primary-button" type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
