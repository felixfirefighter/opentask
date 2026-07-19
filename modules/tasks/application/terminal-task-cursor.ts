import { z } from "zod";

import { entityIdSchema, isoTimestampSchema } from "./contracts";
import { taskValidationFailure } from "./task-errors";

const terminalTaskCursorSchema = z.strictObject({
  version: z.literal(1),
  status: z.enum(["completed", "cancelled"]),
  statusChangedAt: isoTimestampSchema,
  id: entityIdSchema,
});

export type TerminalTaskCursor = z.infer<typeof terminalTaskCursorSchema>;

export function encodeTerminalTaskCursor(cursor: TerminalTaskCursor): string {
  return Buffer.from(JSON.stringify(terminalTaskCursorSchema.parse(cursor)), "utf8").toString("base64url");
}

export function decodeTerminalTaskCursor(
  cursor: string | undefined,
  status: "completed" | "cancelled",
): TerminalTaskCursor | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed = terminalTaskCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown,
    );
    if (encodeTerminalTaskCursor(parsed) !== cursor) throw new Error("Non-canonical cursor");
    if (parsed.status !== status) throw new Error("Cursor status mismatch");
    return parsed;
  } catch {
    throw taskValidationFailure("The completed-task page cursor is invalid or expired.");
  }
}
