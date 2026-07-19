import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { SessionIdentity as AuthSessionIdentity } from "@/shared/auth/actor";
import type { DatabaseExecutor, DatabaseTransaction } from "@/shared/db/client";

import type { InboxSummary } from "@/modules/tasks";

export type InboxBootstrapPort = {
  ensureInbox(userId: string, executor: DatabaseExecutor): Promise<InboxSummary>;
};

export type DemoDatasetSeeder = {
  reset(userId: string, existingTransaction?: DatabaseTransaction): Promise<void>;
};

export type DemoEntryResult = Readonly<{
  actor: AuthenticatedActor;
  mode: "created" | "reset";
  setCookieHeaders: readonly string[];
}>;

export type SessionIdentity = AuthSessionIdentity;
