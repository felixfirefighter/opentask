import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { focusIdSchema } from "./focus-contract-primitives";

export type FocusLinkKind = "task" | "habit";

export const focusOwnedLinkSchema = z
  .strictObject({
    kind: z.enum(["task", "habit"]),
    id: focusIdSchema,
    label: z.string().min(1).nullable(),
    available: z.boolean(),
  })
  .superRefine((link, context) => {
    if (link.available === (link.label === null)) {
      context.addIssue({
        code: "custom",
        path: ["label"],
        message: link.available
          ? "An available focus link requires a label."
          : "An unavailable focus link cannot expose a label.",
      });
    }
  });

export type FocusOwnedLink = Readonly<z.infer<typeof focusOwnedLinkSchema>>;

export const focusResolvedLinkSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("task"),
      id: focusIdSchema,
      label: z.string().min(1).nullable(),
      availability: z.enum(["available", "unavailable"]),
    }),
    z.strictObject({
      kind: z.literal("habit"),
      id: focusIdSchema,
      label: z.string().min(1).nullable(),
      availability: z.enum(["available", "unavailable"]),
    }),
  ])
  .superRefine((link, context) => {
    if (link.availability === "available" && link.label === null) {
      context.addIssue({
        code: "custom",
        path: ["label"],
        message: "An available focus link requires a label.",
      });
    }
    if (link.availability === "unavailable" && link.label !== null) {
      context.addIssue({
        code: "custom",
        path: ["label"],
        message: "An unavailable focus link cannot expose a label.",
      });
    }
  });

export type FocusResolvedLink = z.infer<typeof focusResolvedLinkSchema>;

export const focusLinkIdSelectionSchema = z
  .array(focusIdSchema)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "Focus-link IDs must be unique.");

export const focusLinkSearchInputSchema = z.strictObject({
  q: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.isWellFormed() && !value.includes("\0"), {
      message: "Focus-link search contains a character that cannot be stored safely.",
    })
    .refine((value) => Array.from(value).length <= 120, {
      message: "Focus-link search must contain at most 120 Unicode characters.",
    }),
  limit: z.number().int().min(1).max(20),
});

export type FocusLinkSearchInput = z.infer<typeof focusLinkSearchInputSchema>;

/** Narrow adapter implemented from the owning task or habit module's public reader. */
export interface FocusLinkValidator {
  readonly kind: FocusLinkKind;
  readOwned(
    actor: AuthenticatedActor,
    id: string,
    executor?: DatabaseExecutor,
  ): Promise<FocusOwnedLink | null>;
  readOwnedMany(
    actor: AuthenticatedActor,
    ids: readonly string[],
    executor?: DatabaseExecutor,
  ): Promise<readonly FocusOwnedLink[]>;
  searchOwned(actor: AuthenticatedActor, input: FocusLinkSearchInput): Promise<readonly FocusOwnedLink[]>;
}

export type FocusLinkValidators = Readonly<{
  task: FocusLinkValidator;
  habit: FocusLinkValidator;
}>;
