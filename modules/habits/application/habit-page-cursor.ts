import { z } from "zod";

import { habitIdSchema } from "./contracts/habit-contract-primitives";
import { habitValidationFailed } from "./habit-errors";

const habitPageCursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  scope: z.enum(["definitions", "overviews", "today"]),
  lifecycle: z.enum(["active", "archived"]),
  updatedAt: z.iso
    .datetime({ offset: true })
    .refine((value) => new Date(value).toISOString() === value, "Cursor timestamps must be canonical."),
  id: habitIdSchema,
});

export type HabitPageCursor = z.infer<typeof habitPageCursorPayloadSchema>;
export type HabitPageCursorScope = HabitPageCursor["scope"];
type HabitPageAnchor = Readonly<{ id: string; updatedAt: Date }>;

export function encodeHabitPageCursor(cursor: HabitPageCursor): string {
  return Buffer.from(JSON.stringify(habitPageCursorPayloadSchema.parse(cursor)), "utf8").toString(
    "base64url",
  );
}

export function decodeHabitPageCursor(
  cursor: string | undefined,
  scope: HabitPageCursorScope,
  lifecycle: HabitPageCursor["lifecycle"],
): HabitPageCursor | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed = habitPageCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown,
    );
    if (encodeHabitPageCursor(parsed) !== cursor) throw new Error("Non-canonical cursor");
    if (parsed.scope !== scope || parsed.lifecycle !== lifecycle) throw new Error("Cursor scope mismatch");
    return parsed;
  } catch {
    throw habitValidationFailed("The habit page cursor is invalid or expired.");
  }
}

export function habitPageFromRows<T extends Readonly<{ id: string; updatedAt: Date }>>(
  rows: readonly T[],
  limit: number,
  scope: HabitPageCursorScope,
  lifecycle: HabitPageCursor["lifecycle"],
): Readonly<{ items: T[]; nextCursor: string | null }> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeHabitPageCursor({
            version: 1,
            scope,
            lifecycle,
            updatedAt: last.updatedAt.toISOString(),
            id: last.id,
          })
        : null,
  };
}

export function habitPageAfter(
  cursor: HabitPageCursor | undefined,
  anchor: HabitPageAnchor | null,
): Readonly<{ id: string; updatedAt: Date }> | undefined {
  if (cursor === undefined) return undefined;
  if (!anchor || anchor.id !== cursor.id || anchor.updatedAt.toISOString() !== cursor.updatedAt) {
    throw habitValidationFailed("The habit page cursor is invalid or expired.");
  }
  return { id: cursor.id, updatedAt: new Date(cursor.updatedAt) };
}
