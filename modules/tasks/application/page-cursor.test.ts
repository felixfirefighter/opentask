import { describe, expect, it } from "vitest";

import { decodeRankCursor, encodeRankCursor, pageFromRows } from "./page-cursor";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("rank page cursor", () => {
  it("round-trips a canonical opaque cursor", () => {
    const encoded = encodeRankCursor({ id: firstId, rank: "a0" });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeRankCursor(encoded)).toEqual({ id: firstId, rank: "a0" });
  });

  it("rejects malformed and noncanonical cursors as validation failures", () => {
    const forgedCursor = (rank: string) =>
      Buffer.from(JSON.stringify({ rank, id: firstId }), "utf8").toString("base64url");
    for (const cursor of [
      "not-json",
      "e30",
      "e30=",
      forgedCursor("\0"),
      forgedCursor("not a rank"),
      forgedCursor("0"),
    ]) {
      expect(() => decodeRankCursor(cursor)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_FAILED" }),
      );
    }
  });

  it("emits a next cursor only when another row exists", () => {
    const first = { id: firstId, rank: "a0", value: 1 };
    const second = { id: secondId, rank: "a1", value: 2 };
    const page = pageFromRows([first, second], 1);
    expect(page.items).toEqual([first]);
    expect(decodeRankCursor(page.nextCursor ?? undefined)).toEqual({ id: firstId, rank: "a0" });
    expect(pageFromRows([first], 1).nextCursor).toBeNull();
  });
});
