"use client";

import type { PaletteAsyncAction } from "./TaskCommandPaletteResultItem";
import styles from "./TaskCommandPaletteResults.module.css";

export function TaskCommandPaletteConditions({
  createErrorMessage,
  createUncertain,
  listsError,
  listsLoading,
  noTaskResults,
  offline,
  searchError,
  searchLoading,
  searchTooLong,
  onRetryLists,
  onRetrySearch,
  onAbandonCreate,
}: Readonly<{
  createErrorMessage: string | null;
  createUncertain: boolean;
  listsError: boolean;
  listsLoading: boolean;
  noTaskResults: boolean;
  offline: boolean;
  searchError: boolean;
  searchLoading: boolean;
  searchTooLong: boolean;
  onRetryLists: PaletteAsyncAction;
  onRetrySearch: PaletteAsyncAction;
  onAbandonCreate: () => void;
}>) {
  return (
    <div className={styles.conditions}>
      {offline ? <p role="status">Search and quick add need a connection. Destinations still work.</p> : null}
      {listsLoading ? <p role="status">Loading lists…</p> : null}
      {searchTooLong ? (
        <p role="status">Task search supports 120 characters. You can still add this title.</p>
      ) : null}
      {searchLoading ? <p role="status">Searching tasks…</p> : null}
      {noTaskResults ? <p role="status">No matching tasks. You can add this title instead.</p> : null}
      {searchError ? (
        <p role="alert" data-tone="error">
          Task search could not be loaded. <button onClick={() => void onRetrySearch()}>Try again</button>
        </p>
      ) : null}
      {listsError ? (
        <p role="alert" data-tone="error">
          Lists could not be refreshed. Inbox and Completed still work.{" "}
          <button onClick={() => void onRetryLists()}>Try again</button>
        </p>
      ) : null}
      {createErrorMessage ? (
        <p role="alert" data-tone="error">
          <span>{createErrorMessage}</span>
          {createUncertain ? (
            <button type="button" onClick={onAbandonCreate}>
              Discard safe retry and close
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
