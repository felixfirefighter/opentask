import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { TaskReminderSourceReader } from "@/modules/tasks";
import type { Clock } from "@/shared/time/clock";

import { createCapabilityApplication } from "./capability-application";
import type {
  RegisterPushSubscriptionInput,
  RemoveTaskReminderInput,
  RevokePushSubscriptionInput,
  SetTaskReminderInput,
} from "./contracts";
import { createDeliveryApplication } from "./delivery-application";
import { createMaintenanceApplication } from "./maintenance-application";
import { scheduleActorRecovery } from "./maintenance-scheduling";
import type {
  NotificationDigest,
  NotificationDeliveryRepository,
  NotificationIdGenerator,
  NotificationJobScheduler,
  NotificationRuntimeConfiguration,
  PushProvider,
  PushSubscriptionRepository,
  SubscriptionCipher,
  TaskReminderRepository,
} from "./notification-ports";
import { createNotificationReconciler } from "./notification-reconciler";
import { createReminderApplication } from "./reminder-application";
import { createSubscriptionApplication } from "./subscription-application";

export type NotificationApplicationDependencies = Readonly<{
  database: Database;
  clock: Clock;
  tasks: TaskReminderSourceReader;
  reminders: TaskReminderRepository;
  subscriptions: PushSubscriptionRepository;
  deliveries: NotificationDeliveryRepository;
  cipher: SubscriptionCipher;
  digest: NotificationDigest;
  scheduler: NotificationJobScheduler;
  provider: PushProvider;
  runtime: NotificationRuntimeConfiguration;
  ids: NotificationIdGenerator;
}>;

export function createNotificationApplication(dependencies: NotificationApplicationDependencies) {
  const reconciler = createNotificationReconciler(dependencies);
  const reminders = createReminderApplication({ ...dependencies, reconciler });
  const subscriptions = createSubscriptionApplication(dependencies);
  const delivery = createDeliveryApplication(dependencies);
  const maintenance = createMaintenanceApplication({ ...dependencies, reconciler });
  const capability = createCapabilityApplication(dependencies.runtime);

  async function requestActorRecovery(userId: string): Promise<void> {
    if (dependencies.runtime.capability().worker !== "configured_unverified") return;
    await dependencies.scheduler.ensureQueues();
    await dependencies.database.transaction((transaction) =>
      scheduleActorRecovery(dependencies.scheduler, userId, dependencies.clock.now(), transaction),
    );
  }

  async function requestActorRecoveryWithoutAffectingResponse(userId: string): Promise<void> {
    try {
      await requestActorRecovery(userId);
    } catch {
      // Capability/read responses remain honest and useful when the optional producer is unavailable.
    }
  }

  return {
    ...reminders,
    ...subscriptions,
    ...delivery,
    ...maintenance,
    ...capability,
    reconciler,

    async getPushCapability(actor: Readonly<{ userId: string }>) {
      const result = await capability.getPushCapability(actor);
      await requestActorRecoveryWithoutAffectingResponse(actor.userId);
      return result;
    },

    async getTaskReminder(actor: Readonly<{ userId: string }>, taskId: string) {
      const result = await reminders.getTaskReminder(actor, taskId);
      await requestActorRecoveryWithoutAffectingResponse(actor.userId);
      return result;
    },

    async setTaskReminder(actor: AuthenticatedActor, input: SetTaskReminderInput) {
      const result = await reminders.setTaskReminder(actor, input);
      await requestActorRecoveryWithoutAffectingResponse(actor.userId);
      return result;
    },

    async removeTaskReminder(actor: AuthenticatedActor, input: RemoveTaskReminderInput) {
      const result = await reminders.removeTaskReminder(actor, input);
      await requestActorRecoveryWithoutAffectingResponse(actor.userId);
      return result;
    },

    async registerPushSubscription(
      actor: AuthenticatedActor,
      input: RegisterPushSubscriptionInput,
      context?: Readonly<{ userAgentSummary?: string | null }>,
    ) {
      const result = await subscriptions.registerPushSubscription(actor, input, context);
      await requestActorRecoveryWithoutAffectingResponse(actor.userId);
      return result;
    },

    async revokePushSubscription(actor: AuthenticatedActor, input: RevokePushSubscriptionInput) {
      const result = await subscriptions.revokePushSubscription(actor, input);
      await requestActorRecoveryWithoutAffectingResponse(actor.userId);
      return result;
    },

    requestActorRecovery,
  } as const;
}

export type NotificationApplication = ReturnType<typeof createNotificationApplication>;
