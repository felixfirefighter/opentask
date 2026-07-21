import { z } from "zod";

import { notificationIdSchema } from "./notification-primitives";

export const notificationDeliveryJobSchema = z.strictObject({
  schemaVersion: z.literal(1),
  userId: notificationIdSchema,
  deliveryId: notificationIdSchema,
});

const maintenanceBase = {
  schemaVersion: z.literal(1),
  userId: notificationIdSchema,
} as const;

export const notificationMaintenanceJobSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...maintenanceBase, kind: z.literal("delivery_lease"), deliveryId: notificationIdSchema }),
  z.strictObject({
    ...maintenanceBase,
    kind: z.literal("delivery_cleanup"),
    deliveryId: notificationIdSchema,
  }),
  z.strictObject({
    ...maintenanceBase,
    kind: z.literal("subscription_cleanup"),
    subscriptionId: notificationIdSchema,
  }),
  z.strictObject({
    ...maintenanceBase,
    kind: z.literal("recurring_repair"),
    reminderId: notificationIdSchema,
  }),
  z.strictObject({
    ...maintenanceBase,
    kind: z.literal("actor_recovery"),
    after: z
      .strictObject({
        resource: z.enum(["deliveries", "subscriptions", "reminders"]),
        id: notificationIdSchema,
      })
      .nullable(),
  }),
]);

export type NotificationDeliveryJob = z.infer<typeof notificationDeliveryJobSchema>;
export type NotificationMaintenanceJob = z.infer<typeof notificationMaintenanceJobSchema>;
