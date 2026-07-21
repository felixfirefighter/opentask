import { z } from "zod";

import { notificationIdSchema } from "./notification-primitives";

const p256dhSchema = z.string().regex(/^[A-Za-z0-9_-]{87}$/u, {
  message: "The browser subscription public key is invalid.",
});
const authSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/u, {
  message: "The browser subscription authentication key is invalid.",
});

const subscriptionEndpointSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "A push subscription endpoint must use HTTPS.",
  })
  .refine((value) => new TextEncoder().encode(value).length <= 6_111, {
    message: "A push subscription endpoint is too large to store safely.",
  });

export const registerPushSubscriptionInputSchema = z.strictObject({
  id: notificationIdSchema,
  endpoint: subscriptionEndpointSchema,
  keys: z.strictObject({
    p256dh: p256dhSchema,
    auth: authSecretSchema,
  }),
  deviceLabel: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes("\0"), {
      message: "A device label contains an unsupported character.",
    })
    .refine((value) => Array.from(value).length <= 120, {
      message: "A device label must contain at most 120 Unicode characters.",
    })
    .optional(),
});

export const revokePushSubscriptionInputSchema = z.strictObject({
  endpoint: subscriptionEndpointSchema,
});

export const pushSubscriptionRegistrationResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("subscribed"), subscriptionId: notificationIdSchema }),
  z.strictObject({ status: z.literal("subscription_reset_required") }),
]);

export const pushSubscriptionRevocationResultSchema = z.strictObject({ status: z.literal("revoked") });

export type PushSubscriptionRegistrationResult = z.infer<typeof pushSubscriptionRegistrationResultSchema>;
export type PushSubscriptionRevocationResult = z.infer<typeof pushSubscriptionRevocationResultSchema>;
export type RegisterPushSubscriptionInput = z.infer<typeof registerPushSubscriptionInputSchema>;
export type RevokePushSubscriptionInput = z.infer<typeof revokePushSubscriptionInputSchema>;
