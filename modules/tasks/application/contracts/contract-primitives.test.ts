import { describe, expect, it } from "vitest";

import {
  checklistTitleSchema,
  collectionQuerySchema,
  colorTokenSchema,
  entityIdSchema,
  idempotencyKeyHeaderSchema,
  opaqueCursorSchema,
  organizerNameSchema,
  placementSchema,
  serverRankSchema,
  tagNameSchema,
  taskDescriptionSchema,
  taskTitleSchema,
  versionSchema,
  VERSION_MAX,
} from "./contract-primitives";

const entityId = "11111111-1111-4111-8111-111111111111";

describe("task contract primitives", () => {
  it("accepts UUIDv4 resource and idempotency identifiers only", () => {
    expect(entityIdSchema.parse(entityId)).toBe(entityId);
    expect(idempotencyKeyHeaderSchema.parse(entityId.toUpperCase())).toBe(entityId);

    for (const invalid of [
      undefined,
      "",
      "11111111-1111-1111-8111-111111111111",
      "00000000-0000-0000-0000-000000000000",
      "not-a-uuid",
    ]) {
      expect(() => idempotencyKeyHeaderSchema.parse(invalid)).toThrow();
    }
  });

  it("bounds optimistic versions to PostgreSQL integer capacity", () => {
    expect(versionSchema.parse(VERSION_MAX)).toBe(VERSION_MAX);
    expect(() => versionSchema.parse(VERSION_MAX + 1)).toThrow();
  });

  it("keeps placement closed and never accepts a raw rank", () => {
    for (const placement of [
      { kind: "start" },
      { kind: "end" },
      { kind: "before", anchorId: entityId },
      { kind: "after", anchorId: entityId },
    ]) {
      expect(placementSchema.parse(placement)).toEqual(placement);
    }

    for (const invalid of [
      { kind: "middle" },
      { kind: "before" },
      { kind: "start", anchorId: entityId },
      { kind: "end", rank: "a0" },
    ]) {
      expect(() => placementSchema.parse(invalid)).toThrow();
    }
  });

  it("enforces canonical text and server-rank bounds", () => {
    expect(organizerNameSchema.parse(` ${"a".repeat(120)} `)).toHaveLength(120);
    expect(tagNameSchema.parse("  deep work  ")).toBe("deep work");
    expect(taskTitleSchema.parse("  Ship the demo  ")).toBe("Ship the demo");
    expect(checklistTitleSchema.parse("  Verify mobile  ")).toBe("Verify mobile");
    expect(taskDescriptionSchema.parse("x".repeat(20_000))).toHaveLength(20_000);
    expect(serverRankSchema.parse("r".repeat(128))).toHaveLength(128);

    for (const schema of [organizerNameSchema, tagNameSchema]) {
      expect(() => schema.parse(" ")).toThrow();
      expect(() => schema.parse("x".repeat(121))).toThrow();
    }
    for (const schema of [taskTitleSchema, checklistTitleSchema]) {
      expect(() => schema.parse(" ")).toThrow();
      expect(() => schema.parse("x".repeat(501))).toThrow();
    }
    expect(() => taskDescriptionSchema.parse("x".repeat(20_001))).toThrow();
    expect(() => serverRankSchema.parse("r".repeat(129))).toThrow();
  });

  it("counts user text by Unicode code point rather than UTF-16 code unit", () => {
    expect(taskTitleSchema.parse("😀".repeat(500))).toHaveLength(1_000);
    expect(() => taskTitleSchema.parse("😀".repeat(501))).toThrow();
  });

  it.each(["\ud800", "\udc00", "contains\0null"])(
    "rejects text that cannot round-trip through PostgreSQL",
    (unsafeText) => {
      for (const schema of [
        organizerNameSchema,
        tagNameSchema,
        taskTitleSchema,
        checklistTitleSchema,
        taskDescriptionSchema,
      ]) {
        expect(() => schema.parse(unsafeText)).toThrow();
      }
    },
  );

  it("accepts only the six approved color tokens", () => {
    for (const color of ["coral", "amber", "mint", "sky", "violet", "slate"]) {
      expect(colorTokenSchema.parse(color)).toBe(color);
    }
    expect(() => colorTokenSchema.parse("red")).toThrow();
  });

  it("bounds versions, opaque cursors, and collection pages", () => {
    expect(versionSchema.parse(1)).toBe(1);
    expect(() => versionSchema.parse(0)).toThrow();
    expect(() => versionSchema.parse(1.5)).toThrow();
    expect(opaqueCursorSchema.parse("abc_123-Z")).toBe("abc_123-Z");
    expect(opaqueCursorSchema.parse("a".repeat(512))).toHaveLength(512);
    expect(() => opaqueCursorSchema.parse("a".repeat(513))).toThrow();
    expect(() => opaqueCursorSchema.parse("contains space")).toThrow();

    expect(collectionQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(collectionQuerySchema.parse({ limit: "100", cursor: "next_1" })).toEqual({
      limit: 100,
      cursor: "next_1",
    });
    expect(() => collectionQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() => collectionQuerySchema.parse({ limit: 10, offset: 20 })).toThrow();
  });
});
