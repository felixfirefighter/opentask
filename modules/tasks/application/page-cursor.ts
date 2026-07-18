import { z } from "zod";

import { serverRankSchema } from "./contracts";
import { taskValidationFailure } from "./task-errors";

const rankCursorPayloadSchema = z.strictObject({
  rank: serverRankSchema,
  id: z.uuidv4(),
});

export type RankCursor = z.infer<typeof rankCursorPayloadSchema>;

export function encodeRankCursor(cursor: RankCursor): string {
  return Buffer.from(JSON.stringify(rankCursorPayloadSchema.parse(cursor)), "utf8").toString("base64url");
}

export function decodeRankCursor(cursor: string | undefined): RankCursor | undefined {
  if (cursor === undefined) return undefined;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = rankCursorPayloadSchema.parse(JSON.parse(decoded) as unknown);
    if (encodeRankCursor(parsed) !== cursor) throw new Error("Non-canonical cursor");
    return parsed;
  } catch {
    throw taskValidationFailure("The page cursor is invalid or expired.");
  }
}

export function pageFromRows<T extends { id: string; rank: string }>(
  rows: readonly T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeRankCursor({ id: last.id, rank: last.rank }) : null,
  };
}
