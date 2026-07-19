"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import type { ColorToken, TagDto } from "../application/contracts";
import { COLOR_TOKEN_OPTIONS } from "./color-token-options";
import { useDeleteTagMutation, useUpdateTagMutation } from "./data/use-tag-mutations";
import styles from "./TaskTagDialog.module.css";

export function TagManagerRow({
  checked,
  disabled,
  onCheckedChange,
  onDeleted,
  tag,
}: Readonly<{
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  onDeleted: (tagId: string) => void;
  tag: TagDto;
}>) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(tag.name);
  const [colorToken, setColorToken] = useState(tag.colorToken);
  const update = useUpdateTagMutation();
  const remove = useDeleteTagMutation();
  const cancelRef = useRef<HTMLButtonElement>(null);

  if (editing) {
    return (
      <div className={styles.editRow}>
        <label className="sr-only" htmlFor={`tag-name-${tag.id}`}>
          Tag name
        </label>
        <input
          id={`tag-name-${tag.id}`}
          value={name}
          disabled={disabled || update.isPending}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          aria-label={`Color for ${tag.name}`}
          value={colorToken}
          disabled={disabled || update.isPending}
          onChange={(event) => setColorToken(event.target.value as ColorToken)}
        >
          {COLOR_TOKEN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="quiet-button"
          type="button"
          disabled={update.isPending}
          onClick={() => {
            setName(tag.name);
            setColorToken(tag.colorToken);
            setEditing(false);
            update.reset();
          }}
        >
          Cancel
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={disabled || !name.trim() || update.isPending}
          onClick={() =>
            update.mutate({ tag, name: name.trim(), colorToken }, { onSuccess: () => setEditing(false) })
          }
        >
          Save
        </button>
        {update.error ? (
          <p className={styles.rowError} role="alert">
            The tag was not saved. Your changes are preserved.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.tagRow}>
      <label>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span className={styles.swatch} data-accent={tag.colorToken} aria-hidden="true" />
        <span>{tag.name}</span>
      </label>
      <button
        className="icon-button"
        type="button"
        disabled={disabled}
        aria-label={`Rename ${tag.name}`}
        onClick={() => {
          update.reset();
          setEditing(true);
        }}
      >
        <Pencil size={15} aria-hidden="true" />
      </button>
      <AlertDialog.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (open) remove.reset();
        }}
      >
        <AlertDialog.Trigger asChild>
          <button className="icon-button" type="button" disabled={disabled} aria-label={`Delete ${tag.name}`}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.overlay} />
          <AlertDialog.Content
            className={styles.confirmDialog}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelRef.current?.focus();
            }}
          >
            <AlertDialog.Title>Delete “{tag.name}”?</AlertDialog.Title>
            <AlertDialog.Description>
              This removes the tag from active task views. The task itself is not deleted, and Undo is
              available afterward.
            </AlertDialog.Description>
            {remove.error ? (
              <p className={styles.error} role="alert">
                The tag was not deleted. Nothing changed.
              </p>
            ) : null}
            <div className={styles.actions}>
              <AlertDialog.Cancel asChild>
                <button ref={cancelRef} className="secondary-button" type="button">
                  Keep tag
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={remove.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    remove.mutate(tag, {
                      onSuccess: () => {
                        onDeleted(tag.id);
                        setDeleteOpen(false);
                      },
                    });
                  }}
                >
                  {remove.isPending ? "Deleting…" : "Delete tag"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
