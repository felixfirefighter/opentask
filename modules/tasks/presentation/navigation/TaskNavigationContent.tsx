"use client";

import type { FolderDto, Placement, RegularListDto } from "../../application/contracts";
import { useFoldersQuery, useRegularListsQuery } from "../data/use-organizer-queries";
import styles from "./TaskNavigationOverlays.module.css";
import { NavigationFailure, NavigationLoading } from "./TaskNavigationOverlays";
import { TaskNavigationSortContext } from "./TaskNavigationSortContext";
import { TaskNavigationTree, type TaskNavigationCurrent } from "./TaskNavigationTree";

export function TaskNavigationContent({
  actionError,
  current,
  disabled,
  folders,
  foldersQuery,
  lists,
  listsQuery,
  offline,
  ...actions
}: Readonly<{
  actionError: string | null;
  current: TaskNavigationCurrent;
  disabled: boolean;
  folders: readonly FolderDto[];
  foldersQuery: ReturnType<typeof useFoldersQuery>;
  lists: readonly RegularListDto[];
  listsQuery: ReturnType<typeof useRegularListsQuery>;
  offline: boolean;
  onCreateFolder: () => void;
  onCreateList: (folderId: string | null) => void;
  onDeleteFolder: (folder: FolderDto) => void;
  onDeleteList: (list: RegularListDto) => void;
  onMoveFolder: (folder: FolderDto, placement: Placement) => void;
  onMoveList: (list: RegularListDto, folderId: string | null, placement: Placement) => void;
  onNavigate: () => void;
  onRenameFolder: (folder: FolderDto) => void;
  onRenameList: (list: RegularListDto) => void;
}>) {
  const loading =
    folders.length === 0 && lists.length === 0 && (foldersQuery.isPending || listsQuery.isPending);
  const failedWithoutData =
    foldersQuery.isError && listsQuery.isError && folders.length === 0 && lists.length === 0;
  const folderDetailsLoading =
    foldersQuery.isPending &&
    lists.some((list) => list.folderId !== null && !folders.some((folder) => folder.id === list.folderId));
  const retryNavigation = () => void Promise.all([foldersQuery.refetch(), listsQuery.refetch()]);

  if (loading)
    return (
      <div className={styles.navigationContent} data-context-navigation>
        <NavigationLoading />
      </div>
    );
  if (failedWithoutData) {
    return (
      <div className={styles.navigationContent} data-context-navigation>
        <NavigationFailure onRetry={retryNavigation} />
      </div>
    );
  }

  return (
    <div className={styles.navigationContent} data-context-navigation>
      {offline ? (
        <p className={styles.condition} role="status">
          Navigation is read-only while offline.
        </p>
      ) : null}
      {foldersQuery.isError || listsQuery.isError ? (
        <div className={styles.warning} role="status">
          <span>Some navigation could not be refreshed. Available lists remain below.</span>
          <button type="button" onClick={retryNavigation}>
            Retry navigation
          </button>
        </div>
      ) : folderDetailsLoading ? (
        <p className={styles.condition} role="status">
          Folder details are still loading. Available lists remain below.
        </p>
      ) : null}
      {actionError ? (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      ) : null}
      <TaskNavigationSortContext
        disabled={disabled}
        folders={folders}
        lists={lists}
        onMoveFolder={actions.onMoveFolder}
        onMoveList={actions.onMoveList}
      >
        <TaskNavigationTree
          current={current}
          disabled={disabled}
          folders={folders}
          lists={lists}
          {...actions}
        />
      </TaskNavigationSortContext>
      {foldersQuery.hasNextPage || listsQuery.hasNextPage ? (
        <div className={styles.loadMore}>
          {foldersQuery.hasNextPage ? (
            <button
              type="button"
              disabled={foldersQuery.isFetchingNextPage}
              onClick={() => void foldersQuery.fetchNextPage()}
            >
              {foldersQuery.isFetchingNextPage ? "Loading folders" : "Load more folders"}
            </button>
          ) : null}
          {listsQuery.hasNextPage ? (
            <button
              type="button"
              disabled={listsQuery.isFetchingNextPage}
              onClick={() => void listsQuery.fetchNextPage()}
            >
              {listsQuery.isFetchingNextPage ? "Loading lists" : "Load more lists"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
