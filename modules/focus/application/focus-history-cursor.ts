import { focusHistoryCursorPayloadSchema, type FocusHistoryCursorPayload } from "./contracts";
import { focusValidationFailed } from "./focus-errors";

export function encodeFocusHistoryCursor(payload: FocusHistoryCursorPayload): string {
  return Buffer.from(JSON.stringify(focusHistoryCursorPayloadSchema.parse(payload)), "utf8").toString(
    "base64url",
  );
}

export function decodeFocusHistoryCursor(
  cursor: string | undefined,
  actorUserId: string,
): FocusHistoryCursorPayload | undefined {
  if (cursor === undefined) return undefined;

  try {
    const parsed = focusHistoryCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown,
    );
    if (encodeFocusHistoryCursor(parsed) !== cursor) throw new Error("Non-canonical cursor");
    if (parsed.userId !== actorUserId) throw new Error("Cursor actor mismatch");
    return parsed;
  } catch {
    throw focusValidationFailed("The focus history cursor is invalid or expired.");
  }
}

export function focusHistoryAfter(
  cursor: FocusHistoryCursorPayload | undefined,
  anchor: Readonly<{ id: string; endedAt: Date | null }> | null,
): Readonly<{ id: string; endedAt: Date }> | undefined {
  if (cursor === undefined) return undefined;
  if (
    anchor === null ||
    anchor.id !== cursor.id ||
    anchor.endedAt === null ||
    anchor.endedAt.toISOString() !== cursor.endedAt
  ) {
    throw focusValidationFailed("The focus history cursor is invalid or expired.");
  }
  return { id: cursor.id, endedAt: new Date(cursor.endedAt) };
}
