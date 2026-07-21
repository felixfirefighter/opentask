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

export type OnboardingGoal =
  | "discipline"
  | "tasks"
  | "habits"
  | "reminders"
  | "daily_planning"
  | "scheduling"
  | "other"
  | `other:${string}`;

export type CheckInMood = "good" | "tired" | "heavy" | "ready";

export type OnboardingState = Readonly<{
  complete: boolean;
  completedAt: string | null;
  goals: readonly OnboardingGoal[];
  checkins: readonly Readonly<{ date: string; mood: CheckInMood; note?: string | undefined }>[];
  todayCheckin: OnboardingState["checkins"][number] | null;
}>;
