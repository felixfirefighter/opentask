"use client";

import { Command } from "cmdk";
import type { ReactNode } from "react";

import styles from "./TaskCommandPaletteResults.module.css";

export type PaletteAsyncAction = () => Promise<unknown> | unknown;

export function TaskCommandPaletteResultItem({
  disabled = false,
  icon,
  keywords = [],
  label,
  meta,
  onSelect,
  value,
}: Readonly<{
  disabled?: boolean;
  icon: ReactNode;
  keywords?: string[];
  label: string;
  meta: string;
  onSelect: PaletteAsyncAction;
  value: string;
}>) {
  return (
    <Command.Item
      aria-label={`${label}. ${meta}`}
      className={styles.result}
      disabled={disabled}
      keywords={keywords}
      value={value}
      onSelect={() => void onSelect()}
    >
      <span className={styles.resultIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.resultText}>
        <strong>{label}</strong>
        <span>{meta}</span>
      </span>
    </Command.Item>
  );
}
