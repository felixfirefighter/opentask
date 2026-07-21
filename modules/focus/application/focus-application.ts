import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import type { FocusLinkValidators } from "./contracts";
import { createFocusReadApplication, type UserFocusTimezoneResolver } from "./focus-read-application";
import { createFocusSessionApplication } from "./focus-session-application";

export function createFocusApplication({
  database,
  clock,
  links,
  resolveUserTimezone,
}: Readonly<{
  database: Database;
  clock: Clock;
  links: FocusLinkValidators;
  resolveUserTimezone: UserFocusTimezoneResolver;
}>) {
  return {
    ...createFocusSessionApplication({ database, clock, links }),
    ...createFocusReadApplication({ database, clock, links, resolveUserTimezone }),
  } as const;
}

export type FocusApplication = ReturnType<typeof createFocusApplication>;
