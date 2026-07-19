"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import type { ColorToken, FolderDto, RegularListDto } from "../../application/contracts";
import { COLOR_TOKEN_OPTIONS } from "../color-token-options";
import styles from "./OrganizerDialog.module.css";

export type OrganizerEditor =
  | Readonly<{ kind: "create-folder" }>
  | Readonly<{ folderId: string | null; kind: "create-list" }>
  | Readonly<{ folder: FolderDto; kind: "rename-folder" }>
  | Readonly<{ kind: "rename-list"; list: RegularListDto }>;

export type OrganizerEditorValues = Readonly<{
  colorToken: ColorToken;
  folderId: string | null;
  name: string;
  resourceId: string;
}>;

export function OrganizerDialog({
  disabled,
  editor,
  errorMessage,
  folders,
  isPending,
  onDismiss,
  onSubmit,
}: Readonly<{
  disabled: boolean;
  editor: OrganizerEditor | null;
  errorMessage: string | null;
  folders: readonly FolderDto[];
  isPending: boolean;
  onDismiss: () => void;
  onSubmit: (editor: OrganizerEditor, values: OrganizerEditorValues) => Promise<boolean>;
}>) {
  return (
    <Dialog.Root
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onDismiss();
      }}
    >
      {editor ? (
        <OrganizerDialogContent
          key={editorIdentity(editor)}
          editor={editor}
          disabled={disabled}
          errorMessage={errorMessage}
          folders={folders}
          isPending={isPending}
          onDismiss={onDismiss}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog.Root>
  );
}

function OrganizerDialogContent({
  disabled,
  editor,
  errorMessage,
  folders,
  isPending,
  onDismiss,
  onSubmit,
}: Readonly<{
  disabled: boolean;
  editor: OrganizerEditor;
  errorMessage: string | null;
  folders: readonly FolderDto[];
  isPending: boolean;
  onDismiss: () => void;
  onSubmit: (editor: OrganizerEditor, values: OrganizerEditorValues) => Promise<boolean>;
}>) {
  const list = editor.kind === "rename-list" ? editor.list : null;
  const [name, setName] = useState(initialName(editor));
  const [folderId, setFolderId] = useState(
    editor.kind === "create-list" ? editor.folderId : (list?.folderId ?? null),
  );
  const [colorToken, setColorToken] = useState<ColorToken>(list?.colorToken ?? "coral");
  const resourceId = useRef<string | null>(null);
  const isList = editor.kind === "create-list" || editor.kind === "rename-list";
  const title = editor.kind.startsWith("create")
    ? `Create ${isList ? "list" : "folder"}`
    : `Rename ${isList ? "list" : "folder"}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || isPending) return;
    resourceId.current ??= crypto.randomUUID();
    const saved = await onSubmit(editor, { colorToken, folderId, name, resourceId: resourceId.current });
    if (saved) onDismiss();
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.content} aria-describedby="organizer-dialog-description">
        <header className={styles.header}>
          <div>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <Dialog.Description id="organizer-dialog-description" className={styles.description}>
              Names can be changed later from the item menu.
            </Dialog.Description>
          </div>
          <Dialog.Close
            className={styles.close}
            disabled={isPending}
            aria-label={`Close ${title.toLocaleLowerCase()}`}
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </header>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Name</span>
            <input
              autoFocus
              maxLength={120}
              required
              disabled={disabled || isPending}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                resourceId.current = null;
              }}
            />
          </label>
          {editor.kind === "create-list" ? (
            <label className={styles.field}>
              <span>Folder</span>
              <select
                value={folderId ?? ""}
                disabled={disabled || isPending}
                onChange={(event) => {
                  setFolderId(event.target.value || null);
                  resourceId.current = null;
                }}
              >
                <option value="">No folder</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {isList ? (
            <label className={styles.field}>
              <span>Color</span>
              <select
                value={colorToken}
                disabled={disabled || isPending}
                onChange={(event) => {
                  setColorToken(event.target.value as ColorToken);
                  resourceId.current = null;
                }}
              >
                {COLOR_TOKEN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
          {disabled ? (
            <p className={styles.error} role="status">
              Reconnect to save organization changes.
            </p>
          ) : null}
          <footer className={styles.actions}>
            <Dialog.Close className={styles.secondaryButton} type="button" disabled={isPending}>
              Cancel
            </Dialog.Close>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={disabled || isPending || !name.trim()}
            >
              {isPending ? "Saving" : title}
            </button>
          </footer>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function initialName(editor: OrganizerEditor) {
  if (editor.kind === "rename-folder") return editor.folder.name;
  if (editor.kind === "rename-list") return editor.list.name;
  return "";
}

function editorIdentity(editor: OrganizerEditor) {
  if (editor.kind === "rename-folder") return `${editor.kind}:${editor.folder.id}`;
  if (editor.kind === "rename-list") return `${editor.kind}:${editor.list.id}`;
  return editor.kind;
}
