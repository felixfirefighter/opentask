import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";

import {
  taskPlanningSnapshotRequestSchema,
  taskPlanningSnapshotResultSchema,
  type BoundedTaskOccurrencePage,
  type TaskOccurrenceRangeQuery,
  type TaskPlanningSnapshotReader,
  type TaskPlanningSourcePage,
  type TaskPlanningSourceQuery,
} from "./contracts";
import type { TaskReadSnapshot } from "./task-read-snapshot";

type OpenTaskSnapshotReader = (
  actor: AuthenticatedActor,
  query: TaskPlanningSourceQuery,
  transaction: DatabaseTransaction,
) => Promise<TaskPlanningSourcePage>;

type OccurrenceSnapshotReader = (
  actor: AuthenticatedActor,
  query: TaskOccurrenceRangeQuery,
  transaction: DatabaseTransaction,
  projectionTimeZone: string,
) => Promise<BoundedTaskOccurrencePage>;

export function createTaskPlanningSnapshotReader(
  dependencies: Readonly<{
    snapshot: TaskReadSnapshot;
    readOpenTasksInSnapshot: OpenTaskSnapshotReader;
    readOccurrencesInSnapshot: OccurrenceSnapshotReader;
  }>,
): TaskPlanningSnapshotReader {
  return {
    async readPlanningSnapshot(actor, rawRequest) {
      const request = taskPlanningSnapshotRequestSchema.parse(rawRequest);
      return dependencies.snapshot.run(async (transaction) => {
        const taskPage = await dependencies.readOpenTasksInSnapshot(actor, request.taskQuery, transaction);
        const occurrencePages: BoundedTaskOccurrencePage[] = [];
        for (const query of request.occurrenceQueries) {
          occurrencePages.push(
            await dependencies.readOccurrencesInSnapshot(actor, query, transaction, request.timeZone),
          );
        }
        return taskPlanningSnapshotResultSchema.parse({ taskPage, occurrencePages });
      });
    },
  };
}
