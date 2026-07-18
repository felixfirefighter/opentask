import type { DatabaseExecutor } from "@/shared/db/client";

import {
  regularListDtoSchema,
  regularListPageSchema,
  type RegularListDto,
  type RegularListPage,
} from "./contracts";
import { pageFromRows } from "./page-cursor";
import { createFolderRepository } from "../infrastructure/folder-repository";
import type { StoredRegularListProjection, StoredTaskList } from "../infrastructure/task-list-repository";

export function mapRegularListPage(
  rows: readonly StoredRegularListProjection[],
  limit: number,
): RegularListPage {
  const ranked = rows.map((projection) => ({
    id: projection.list.id,
    rank: projection.list.rank,
    projection,
  }));
  const page = pageFromRows(ranked, limit);
  return regularListPageSchema.parse({
    items: page.items.map(({ projection }) => mapRegularList(projection.list, projection.effectiveFolderId)),
    nextCursor: page.nextCursor,
  });
}

export async function effectiveFolderId(
  userId: string,
  list: StoredTaskList,
  executor: DatabaseExecutor,
): Promise<string | null> {
  if (list.folderId === null) return null;
  const folder = await createFolderRepository(executor).findById(userId, list.folderId, executor);
  return folder?.id ?? null;
}

export function mapRegularList(list: StoredTaskList, effectiveFolder: string | null): RegularListDto {
  return regularListDtoSchema.parse({
    id: list.id,
    folderId: effectiveFolder,
    name: list.name,
    colorToken: list.colorToken,
    rank: list.rank,
    kind: list.kind,
    version: list.version,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
    deletedAt: list.deletedAt?.toISOString() ?? null,
  });
}
