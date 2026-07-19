import type { AuthenticatedActor } from "@/shared/auth/actor";

import type { TaskSnapshotDto } from "./schedule-contract";

export interface TaskSnapshotReader {
  loadOpenUnscheduled(
    actor: AuthenticatedActor,
    taskIds: readonly string[],
  ): Promise<readonly TaskSnapshotDto[]>;
}
