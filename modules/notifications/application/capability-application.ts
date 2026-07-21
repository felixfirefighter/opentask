import type { AuthenticatedActor } from "@/shared/auth/actor";

import { pushCapabilitySchema, type PushCapability } from "./contracts";
import type { NotificationRuntimeConfiguration } from "./notification-ports";

export function createCapabilityApplication(configuration: NotificationRuntimeConfiguration) {
  return {
    async getPushCapability(actor: AuthenticatedActor): Promise<PushCapability> {
      void actor;
      return pushCapabilitySchema.parse(configuration.capability());
    },
  } as const;
}
