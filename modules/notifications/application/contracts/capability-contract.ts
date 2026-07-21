import { z } from "zod";

export const pushCapabilitySchema = z
  .strictObject({
    provider: z.enum(["configured", "unconfigured"]),
    storageEncryption: z.enum(["configured", "unconfigured"]),
    worker: z.enum(["configured_unverified", "known_disabled", "unconfigured"]),
    vapidPublicKey: z.string().min(1).nullable(),
  })
  .superRefine((capability, context) => {
    if ((capability.provider === "configured") !== (capability.vapidPublicKey !== null)) {
      context.addIssue({
        code: "custom",
        path: ["vapidPublicKey"],
        message: "The public VAPID key must match the provider configuration state.",
      });
    }
  });

export type PushCapability = z.infer<typeof pushCapabilitySchema>;
