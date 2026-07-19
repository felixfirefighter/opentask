"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import { useCreateTaskMutation } from "./data/use-task-editor-mutations";
import { useRegularListsQuery } from "./data/use-organizer-queries";
import { useTaskSearchQuery } from "./data/use-task-queries";
import styles from "./TaskCommandPalette.module.css";
import { TaskCommandPaletteResults } from "./TaskCommandPaletteResults";
import { confirmTaskDraftNavigation } from "./task-draft-guard";

const SEARCH_LIMIT = 120;
const TITLE_LIMIT = 500;

export function TaskCommandPalette({
  currentListId,
  inbox,
}: Readonly<{
  currentListId?: string;
  inbox: { id: string; name: string };
}>) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [requestPending, setRequestPending] = useState(false);
  const draftResourceId = useRef<string | null>(null);
  const queryRef = useRef("");
  const requestInFlight = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listsQuery = useRegularListsQuery();
  const create = useCreateTaskMutation();
  const createPending = requestPending || create.isPending;
  const cleanQuery = query.trim();
  const searchTooLong = characterCount(cleanQuery) > SEARCH_LIMIT;
  const titleValid = characterCount(cleanQuery) <= TITLE_LIMIT;
  const search = useTaskSearchQuery(open && online && !searchTooLong ? cleanQuery : "");
  const destinationId = currentListId ?? inbox.id;
  const destinationName =
    destinationId === inbox.id
      ? inbox.name
      : (listsQuery.lists.find((list) => list.id === destinationId)?.name ?? "Current list");

  useEffect(() => {
    function toggle(event: KeyboardEvent) {
      if (event.repeat || event.defaultPrevented || event.altKey || event.shiftKey) return;
      if (event.key.toLocaleLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setOpen((value) => {
        if (value) {
          requestAnimationFrame(() => returnFocus.current?.focus());
          return false;
        }
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return true;
      });
    }

    document.addEventListener("keydown", toggle);
    return () => document.removeEventListener("keydown", toggle);
  }, []);

  function updateQuery(nextQuery: string) {
    if (requestInFlight.current || create.isPending) return;
    queryRef.current = nextQuery;
    setQuery(nextQuery);
    setAnnouncement("");
    draftResourceId.current = null;
    create.reset();
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setOpen(nextOpen);
    if (!nextOpen) requestAnimationFrame(() => returnFocus.current?.focus());
  }

  function closeAndReset() {
    if (requestInFlight.current || create.isPending) return;
    changeOpen(false);
    queryRef.current = "";
    setQuery("");
    draftResourceId.current = null;
    create.reset();
  }

  function navigate(href: string) {
    if (requestInFlight.current || create.isPending) return;
    if (!confirmTaskDraftNavigation()) return;
    closeAndReset();
    router.push(href);
  }

  async function addTask() {
    if (!online || !cleanQuery || !titleValid || requestInFlight.current || create.isPending) return;
    const submittedQuery = query;
    draftResourceId.current ??= crypto.randomUUID();
    const resourceId = draftResourceId.current;
    requestInFlight.current = true;
    setRequestPending(true);
    try {
      await create.mutateAsync({
        resourceId,
        input: {
          title: cleanQuery,
          descriptionMd: "",
          priority: "none",
          listId: destinationId,
          sectionId: null,
          parentTaskId: null,
          placement: { kind: "start" },
        },
      });
      if (draftResourceId.current === resourceId && queryRef.current === submittedQuery) {
        changeOpen(false);
        queryRef.current = "";
        setQuery("");
        draftResourceId.current = null;
      }
      setAnnouncement(`Task added to ${destinationName}.`);
    } catch {
      // Mutation state renders a persistent error while the title and idempotency key remain intact.
    } finally {
      requestInFlight.current = false;
      setRequestPending(false);
    }
  }

  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Search tasks and commands (Command or Control K)"
        onClick={() => changeOpen(true)}
      >
        <Search size={17} aria-hidden="true" />
        <span>Search</span>
        <kbd aria-hidden="true">⌘K</kbd>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      <Command.Dialog
        className={styles.command}
        contentClassName={styles.dialog!}
        overlayClassName={styles.overlay!}
        label="Search tasks and commands"
        loop
        open={open}
        shouldFilter={false}
        onOpenChange={changeOpen}
      >
        <Dialog.Title className="sr-only">Search tasks and commands</Dialog.Title>
        <Dialog.Description className="sr-only">
          Search tasks, open a destination, or add an unscheduled task. Use arrow keys to choose a result.
        </Dialog.Description>
        <div className={styles.inputRow}>
          <Search size={19} aria-hidden="true" />
          <Command.Input
            disabled={!online || createPending}
            value={query}
            onValueChange={updateQuery}
            maxLength={TITLE_LIMIT}
            placeholder="Search tasks or type a task title…"
          />
          <kbd aria-hidden="true">Esc</kbd>
          <Dialog.Close className={styles.close} aria-label="Close search">
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </div>
        <TaskCommandPaletteResults
          canCreate={online && cleanQuery.length > 0 && titleValid && !createPending}
          createError={create.isError}
          destinationName={destinationName}
          inbox={inbox}
          lists={listsQuery.lists}
          listsError={listsQuery.isError}
          listsLoading={listsQuery.isPending}
          listsMore={listsQuery.hasNextPage}
          listsMoreLoading={listsQuery.isFetchingNextPage}
          offline={!online}
          query={cleanQuery}
          searchError={search.isError}
          searchLoading={cleanQuery.length > 0 && !searchTooLong && search.isPending}
          searchMore={search.hasNextPage}
          searchMoreLoading={search.isFetchingNextPage}
          searchResults={search.results}
          searchTooLong={searchTooLong}
          onCreate={addTask}
          onLoadMoreLists={listsQuery.fetchNextPage}
          onLoadMoreSearch={search.fetchNextPage}
          onNavigate={navigate}
          onRetryLists={listsQuery.refetch}
          onRetrySearch={search.refetch}
        />
        <footer className={styles.footer}>
          <span>↑↓ Choose</span>
          <span>Enter Open</span>
          <span>Esc Close</span>
        </footer>
      </Command.Dialog>
    </>
  );
}

function characterCount(value: string) {
  return Array.from(value).length;
}
