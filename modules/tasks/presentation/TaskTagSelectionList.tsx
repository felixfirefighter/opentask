"use client";

import type { TagDto } from "../application/contracts";
import { TagManagerRow } from "./TagManagerRow";
import styles from "./TaskTagDialog.module.css";

export function TaskTagSelectionList({
  availableTags,
  disabled,
  error,
  fetchingNextPage,
  hasNextPage,
  loading,
  onCheckedChange,
  onDeleted,
  onLoadMore,
  selectedIds,
}: Readonly<{
  availableTags: readonly TagDto[];
  disabled: boolean;
  error: boolean;
  fetchingNextPage: boolean;
  hasNextPage: boolean;
  loading: boolean;
  onCheckedChange: (tag: TagDto, checked: boolean) => void;
  onDeleted: (tagId: string) => void;
  onLoadMore: () => void;
  selectedIds: ReadonlySet<string>;
}>) {
  if (loading && availableTags.length === 0) return <p role="status">Loading tags…</p>;
  if (error && availableTags.length === 0) {
    return <p role="alert">Tags could not be loaded. Try opening this dialog again.</p>;
  }
  if (availableTags.length === 0) return <p>No tags yet. Create the first one below.</p>;

  return (
    <>
      {availableTags.map((tag) => (
        <TagManagerRow
          key={tag.id}
          tag={tag}
          checked={selectedIds.has(tag.id)}
          disabled={disabled}
          onDeleted={onDeleted}
          onCheckedChange={(checked) => onCheckedChange(tag, checked)}
        />
      ))}
      {error ? <p role="alert">Some tags could not be refreshed.</p> : null}
      {hasNextPage ? (
        <button
          className={styles.loadMore}
          type="button"
          disabled={disabled || fetchingNextPage}
          onClick={onLoadMore}
        >
          {fetchingNextPage ? "Loading…" : "Load more tags"}
        </button>
      ) : null}
    </>
  );
}
