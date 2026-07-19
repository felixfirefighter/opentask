"use client";

import { useEffect } from "react";

export function WorkspaceRouteError({
  error,
  onRetry,
}: Readonly<{ error: Error & { digest?: string }; onRetry: () => void }>) {
  useEffect(() => {
    // Next records the full server error; only its opaque digest is acknowledged here.
    void error.digest;
  }, [error]);

  return (
    <main className="workspace-route-state">
      <div role="alert">
        <p className="eyebrow">Workspace</p>
        <h1>Something interrupted this view</h1>
        <p>Your data was not changed. Try loading the view again.</p>
        <button className="primary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    </main>
  );
}
