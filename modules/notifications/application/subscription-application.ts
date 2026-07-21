import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  registerPushSubscriptionInputSchema,
  revokePushSubscriptionInputSchema,
  type PushSubscriptionRegistrationResult,
  type PushSubscriptionRevocationResult,
  type RegisterPushSubscriptionInput,
  type RevokePushSubscriptionInput,
} from "./contracts";
import { notificationConflict, notificationProviderUnavailable } from "./notification-errors";
import {
  notificationCleanupAt,
  scheduleActorRecovery,
  scheduleTargetMaintenance,
} from "./maintenance-scheduling";
import type {
  NotificationDigest,
  NotificationDeliveryRepository,
  NotificationJobScheduler,
  PushSubscriptionRepository,
  SubscriptionCipher,
} from "./notification-ports";
import { isTerminalDeliveryState } from "../domain/delivery-policy";
import { ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX } from "../domain/notification-limits";

export function createSubscriptionApplication(
  dependencies: Readonly<{
    database: Database;
    clock: Clock;
    subscriptions: PushSubscriptionRepository;
    deliveries: NotificationDeliveryRepository;
    cipher: SubscriptionCipher;
    digest: NotificationDigest;
    scheduler: NotificationJobScheduler;
  }>,
) {
  return {
    async registerPushSubscription(
      actor: AuthenticatedActor,
      rawInput: RegisterPushSubscriptionInput,
      context?: Readonly<{ userAgentSummary?: string | null }>,
    ): Promise<PushSubscriptionRegistrationResult> {
      const input = registerPushSubscriptionInputSchema.parse(rawInput);
      const keyVersion = requireActiveEncryption(dependencies.cipher);
      const endpointHash = dependencies.digest.sha256Bytes(input.endpoint);
      const userAgentSummary = normalizeUserAgentSummary(context?.userAgentSummary);
      await dependencies.scheduler.ensureQueues();

      return dependencies.database.transaction(async (transaction) => {
        const now = dependencies.clock.now();
        await dependencies.subscriptions.lockRegistrationScope(actor.userId, transaction);
        const current = await dependencies.subscriptions.findActiveByEndpointHash(
          actor.userId,
          endpointHash,
          transaction,
          true,
        );
        const encrypted = encryptMaterial(dependencies.cipher, {
          userId: actor.userId,
          subscriptionId: current?.id ?? input.id,
          keyVersion,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
        });

        if (current) {
          const refreshed = await dependencies.subscriptions.refresh(
            {
              userId: actor.userId,
              id: current.id,
              ...encrypted,
              deviceLabel: input.deviceLabel ?? null,
              userAgentSummary,
              now,
            },
            transaction,
          );
          if (!refreshed) throw notificationConflict("This browser subscription changed concurrently.");
          await scheduleActorRecovery(dependencies.scheduler, actor.userId, now, transaction);
          return { status: "subscribed", subscriptionId: refreshed.id };
        }

        const activeIds = await dependencies.subscriptions.listActiveIdsUpTo(
          actor.userId,
          ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX,
          transaction,
        );
        if (activeIds.length >= ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX) {
          throw notificationConflict(
            `An account can have at most ${ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX} active browser subscriptions. Turn off reminders in another browser and try again.`,
          );
        }

        const inserted = await dependencies.subscriptions.insert(
          {
            id: input.id,
            userId: actor.userId,
            endpointHash,
            ...encrypted,
            deviceLabel: input.deviceLabel ?? null,
            userAgentSummary,
            now,
          },
          transaction,
        );
        if (inserted.kind === "endpoint_conflict") return { status: "subscription_reset_required" };
        if (inserted.kind === "id_conflict") {
          throw notificationConflict("This subscription identifier was already used.");
        }
        await scheduleActorRecovery(dependencies.scheduler, actor.userId, now, transaction);
        return { status: "subscribed", subscriptionId: inserted.subscription.id };
      });
    },

    async revokePushSubscription(
      actor: AuthenticatedActor,
      rawInput: RevokePushSubscriptionInput,
    ): Promise<PushSubscriptionRevocationResult> {
      const input = revokePushSubscriptionInputSchema.parse(rawInput);
      const endpointHash = dependencies.digest.sha256Bytes(input.endpoint);
      await dependencies.scheduler.ensureQueues();

      return dependencies.database.transaction(async (transaction) => {
        const now = dependencies.clock.now();
        const current = await dependencies.subscriptions.findActiveByEndpointHash(
          actor.userId,
          endpointHash,
          transaction,
          true,
        );
        if (current) {
          const revoked = await dependencies.subscriptions.revoke(actor.userId, current.id, now, transaction);
          if (revoked) {
            const deliveries = await dependencies.deliveries.listBySubscription(
              actor.userId,
              current.id,
              transaction,
              true,
            );
            for (const delivery of deliveries) {
              if (isTerminalDeliveryState(delivery.state)) continue;
              const suppressed = await dependencies.deliveries.writeState(
                {
                  userId: actor.userId,
                  id: delivery.id,
                  expectedState: delivery.state,
                  expectedAttemptCount: delivery.attemptCount,
                  state: "suppressed",
                  attemptCount: delivery.attemptCount,
                  lastErrorCode: "subscription_revoked",
                  deliveredAt: null,
                  now,
                },
                transaction,
              );
              if (suppressed) {
                await scheduleTargetMaintenance(
                  dependencies.scheduler,
                  {
                    schemaVersion: 1,
                    userId: actor.userId,
                    kind: "delivery_cleanup",
                    deliveryId: delivery.id,
                  },
                  notificationCleanupAt(now),
                  transaction,
                );
              }
            }
            await scheduleTargetMaintenance(
              dependencies.scheduler,
              {
                schemaVersion: 1,
                userId: actor.userId,
                kind: "subscription_cleanup",
                subscriptionId: current.id,
              },
              notificationCleanupAt(now),
              transaction,
            );
          }
        }
        await scheduleActorRecovery(dependencies.scheduler, actor.userId, now, transaction);
        return { status: "revoked" };
      });
    },
  } as const;
}

function requireActiveEncryption(cipher: SubscriptionCipher): number {
  if (!cipher.configured || cipher.activeKeyVersion === null) {
    throw notificationProviderUnavailable(
      "Browser notification storage encryption is not configured on this server.",
    );
  }
  return cipher.activeKeyVersion;
}

function encryptMaterial(
  cipher: SubscriptionCipher,
  input: Readonly<{
    userId: string;
    subscriptionId: string;
    keyVersion: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>,
) {
  return {
    encryptionKeyVersion: input.keyVersion,
    endpointCiphertext: cipher.encrypt({
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      field: "endpoint",
      keyVersion: input.keyVersion,
      plaintext: input.endpoint,
    }),
    p256dhCiphertext: cipher.encrypt({
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      field: "p256dh",
      keyVersion: input.keyVersion,
      plaintext: input.p256dh,
    }),
    authCiphertext: cipher.encrypt({
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      field: "auth",
      keyVersion: input.keyVersion,
      plaintext: input.auth,
    }),
  } as const;
}

function normalizeUserAgentSummary(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return Array.from(normalized).slice(0, 500).join("");
}
