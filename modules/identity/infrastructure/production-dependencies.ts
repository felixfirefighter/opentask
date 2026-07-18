import { getEnvironment } from "@/shared/config/environment";
import { getDatabase } from "@/shared/db/client";
import { systemClock } from "@/shared/time/clock";

import { resolveAuthRuntimeConfig } from "./auth-runtime-config";

export function getProductionIdentityDependencies() {
  return {
    database: getDatabase(),
    clock: systemClock,
    authRuntime: resolveAuthRuntimeConfig(getEnvironment()),
  };
}
