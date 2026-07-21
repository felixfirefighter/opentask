"use client";

import { Link2, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import type { FocusLinkOption, FocusLinkSearchView, FocusLinkView } from "./focus-screen-model";
import styles from "./FocusLinkPicker.module.css";

export function FocusLinkPicker({
  disabled,
  link,
  onChange,
  onSearch,
  search,
}: Readonly<{
  disabled: boolean;
  link: FocusLinkView | null;
  onChange: (link: FocusLinkView | null) => void;
  onSearch: (query: string) => void;
  search: FocusLinkSearchView;
}>) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = search.options;

  if (link) {
    const linkLabel = link.available && link.label ? link.label : "Linked item unavailable";
    return (
      <div className={styles.field}>
        <span className={styles.label}>Linked item</span>
        <div className={styles.selection}>
          <Link2 size={16} aria-hidden="true" />
          <span className={styles.selectionText}>
            <strong>{linkLabel}</strong>
            <span>{link.available ? capitalize(link.kind) : "Unavailable"}</span>
          </span>
          <button
            type="button"
            className={styles.remove}
            aria-label={`Remove link to ${linkLabel}`}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const activeOption = matches[activeIndex];
  function select(option: FocusLinkOption) {
    onChange(option);
    setQuery("");
    onSearch("");
    setOpen(false);
    setActiveIndex(0);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const movement = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        matches.length === 0 ? 0 : (current + movement + matches.length) % matches.length,
      );
      return;
    }
    if (event.key === "Enter" && open && activeOption) {
      event.preventDefault();
      select(activeOption);
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`${id}-input`}>
        Link to a task or habit <span>(optional)</span>
      </label>
      <div className={styles.combobox}>
        <Link2 size={16} aria-hidden="true" />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-expanded={open}
          aria-activedescendant={
            open && activeOption ? `${id}-option-${activeOption.kind}-${activeOption.id}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          placeholder="Search tasks and habits"
          value={query}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            const nextQuery = event.currentTarget.value;
            setQuery(nextQuery);
            onSearch(nextQuery);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open ? (
        <div className={styles.results} id={`${id}-listbox`} role="listbox">
          {search.status === "loading" ? (
            <p role="status">Searching tasks and habits…</p>
          ) : search.status === "error" ? (
            <p role="alert">Links could not be searched. Try again.</p>
          ) : query.trim().length === 0 ? (
            <p>Type to search tasks and habits</p>
          ) : matches.length === 0 ? (
            <p>No matching tasks or habits</p>
          ) : (
            matches.map((option, index) => (
              <div
                aria-label={`${option.label}, ${capitalize(option.kind)}`}
                aria-selected={index === activeIndex}
                className={styles.option}
                id={`${id}-option-${option.kind}-${option.id}`}
                key={`${option.kind}-${option.id}`}
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
              >
                <span>{option.label}</span>
                <small>{capitalize(option.kind)}</small>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
