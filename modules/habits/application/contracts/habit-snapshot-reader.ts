import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

export type HabitSnapshotDto = Readonly<{
  id: string;
  title: string;
  version: number;
  archived: boolean;
}>;

export interface HabitSnapshotReader {
  readOwned(
    actor: AuthenticatedActor,
    habitId: string,
    executor?: DatabaseExecutor,
  ): Promise<HabitSnapshotDto | null>;
}
