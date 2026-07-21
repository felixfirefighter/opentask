"use client";

import { CheckCircle2, Inbox, ListTodo, Plus, RefreshCw, Sprout, Timer } from "lucide-react";
import { Command } from "cmdk";

import type { RegularListDto, TaskSearchResultDto } from "../application/contracts";
import { TaskCommandPaletteConditions } from "./TaskCommandPaletteConditions";
import styles from "./TaskCommandPaletteResults.module.css";
import {
  TaskCommandPaletteResultItem as ResultItem,
  type PaletteAsyncAction,
} from "./TaskCommandPaletteResultItem";

export function TaskCommandPaletteResults({
  canCreate,
  createErrorMessage,
  createUncertain,
  destinationName,
  inbox,
  lists,
  listsError,
  listsLoading,
  listsMore,
  listsMoreLoading,
  offline,
  query,
  searchError,
  searchLoading,
  searchMore,
  searchMoreLoading,
  searchResults,
  searchTooLong,
  onCreate,
  onAbandonCreate,
  onLoadMoreLists,
  onLoadMoreSearch,
  onNavigate,
  onRetryLists,
  onRetrySearch,
}: Readonly<{
  canCreate: boolean;
  createErrorMessage: string | null;
  createUncertain: boolean;
  destinationName: string;
  inbox: { id: string; name: string };
  lists: readonly RegularListDto[];
  listsError: boolean;
  listsLoading: boolean;
  listsMore: boolean;
  listsMoreLoading: boolean;
  offline: boolean;
  query: string;
  searchError: boolean;
  searchLoading: boolean;
  searchMore: boolean;
  searchMoreLoading: boolean;
  searchResults: readonly TaskSearchResultDto[];
  searchTooLong: boolean;
  onCreate: PaletteAsyncAction;
  onAbandonCreate: () => void;
  onLoadMoreLists: PaletteAsyncAction;
  onLoadMoreSearch: PaletteAsyncAction;
  onNavigate: (href: string) => void;
  onRetryLists: PaletteAsyncAction;
  onRetrySearch: PaletteAsyncAction;
}>) {
  const hasQuery = query.length > 0;
  const noTaskResults = hasQuery && !offline && !searchTooLong && !searchLoading && !searchError;
  const showEveryDestination = !hasQuery || offline;
  const destinationMatches = (name: string) =>
    showEveryDestination || name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visibleLists = lists.filter((list) => destinationMatches(list.name));

  return (
    <>
      <TaskCommandPaletteConditions
        createErrorMessage={createErrorMessage}
        createUncertain={createUncertain}
        listsError={listsError}
        listsLoading={listsLoading}
        offline={offline}
        searchError={searchError}
        searchLoading={searchLoading}
        searchTooLong={searchTooLong}
        noTaskResults={noTaskResults && searchResults.length === 0}
        onRetryLists={onRetryLists}
        onRetrySearch={onRetrySearch}
        onAbandonCreate={onAbandonCreate}
      />
      <Command.List className={styles.results} label="Commands and task results">
        <Command.Empty className={styles.empty}>No matching commands.</Command.Empty>
        <Command.Group heading="Navigate">
          {destinationMatches(inbox.name) ? (
            <ResultItem
              icon={<Inbox size={18} />}
              label={inbox.name}
              meta="Destination"
              value={`navigate inbox ${inbox.name}`}
              onSelect={() => onNavigate("/inbox")}
            />
          ) : null}
          {destinationMatches("Completed / cancelled") ? (
            <ResultItem
              icon={<CheckCircle2 size={18} />}
              label="Completed / cancelled"
              meta="Destination"
              value="navigate completed cancelled"
              onSelect={() => onNavigate("/completed")}
            />
          ) : null}
          {destinationMatches("Habits") ? (
            <ResultItem
              icon={<Sprout size={18} />}
              label="Habits"
              meta="Destination"
              value="navigate habits"
              onSelect={() => onNavigate("/habits")}
            />
          ) : null}
          {destinationMatches("Focus") ? (
            <ResultItem
              icon={<Timer size={18} />}
              label="Focus"
              meta="Destination"
              value="navigate focus"
              onSelect={() => onNavigate("/focus")}
            />
          ) : null}
          {visibleLists.map((list) => (
            <ResultItem
              key={list.id}
              icon={<ListTodo size={18} />}
              label={list.name}
              meta="List"
              value={`navigate list ${list.id} ${list.name}`}
              onSelect={() => onNavigate(`/lists/${list.id}`)}
            />
          ))}
          {listsMore ? (
            <ResultItem
              disabled={listsMoreLoading}
              icon={<RefreshCw size={18} />}
              label={listsMoreLoading ? "Loading lists…" : "Load more lists"}
              meta="More destinations"
              value="load more list destinations"
              onSelect={onLoadMoreLists}
            />
          ) : null}
        </Command.Group>

        {searchResults.length > 0 ? (
          <Command.Group heading="Tasks">
            {searchResults.map((result) => (
              <ResultItem
                key={result.task.id}
                icon={<ListTodo size={18} />}
                label={result.task.title}
                meta={`Task${result.recurrence ? " · Repeat" : ""} · ${result.list.name} · ${matchedContext(result)}`}
                value={`task ${result.task.id} ${result.task.title}`}
                keywords={[result.list.name, ...result.matchingTags.map((tag) => tag.name)]}
                onSelect={() => onNavigate(`/tasks/${result.task.id}`)}
              />
            ))}
            {searchMore ? (
              <ResultItem
                disabled={searchMoreLoading}
                icon={<RefreshCw size={18} />}
                label={searchMoreLoading ? "Loading tasks…" : "Load more tasks"}
                meta="More search results"
                value={`load more task results ${query}`}
                onSelect={onLoadMoreSearch}
              />
            ) : null}
          </Command.Group>
        ) : null}

        {canCreate ? (
          <Command.Group heading="Create">
            <ResultItem
              icon={<Plus size={18} />}
              label={`Add “${query}”`}
              meta={`Create task · ${destinationName}`}
              value={`create task ${query}`}
              keywords={["add task", destinationName]}
              onSelect={onCreate}
            />
          </Command.Group>
        ) : null}
      </Command.List>
    </>
  );
}

function matchedContext(result: TaskSearchResultDto) {
  const labels = result.matchedFields.map((field) => (field === "description" ? "notes" : field));
  return `Matched ${labels.join(", ")}`;
}
