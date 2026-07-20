import type { UserExportEnvelope } from "./export-envelope-contract";

export function findExportRelationshipErrors(envelope: UserExportEnvelope): readonly string[] {
  const errors: string[] = [];
  const folders = uniqueIds(envelope.tasks.folders, "folder", errors);
  const lists = uniqueIds(envelope.tasks.lists, "list", errors);
  const sections = uniqueIds(envelope.tasks.sections, "section", errors);
  const tasks = uniqueIds(envelope.tasks.tasks, "task", errors);
  const tags = uniqueIds(envelope.tasks.tags, "tag", errors);
  uniqueIds(envelope.tasks.checklistItems, "checklist item", errors);
  uniqueIds(envelope.tasks.occurrenceEvents, "occurrence event", errors);

  for (const list of envelope.tasks.lists) {
    if (list.folderId !== null && !folders.has(list.folderId)) {
      errors.push(`List ${list.id} references an unknown folder.`);
    }
  }
  for (const section of envelope.tasks.sections) {
    if (!lists.has(section.listId)) errors.push(`Section ${section.id} references an unknown list.`);
  }
  for (const task of envelope.tasks.tasks) {
    if (!lists.has(task.listId)) errors.push(`Task ${task.id} references an unknown list.`);
    if (task.sectionId !== null) {
      const section = sections.get(task.sectionId);
      if (!section || section.listId !== task.listId) {
        errors.push(`Task ${task.id} references an invalid section.`);
      }
    }
    if (task.parentTaskId !== null) {
      const parent = tasks.get(task.parentTaskId);
      if (!parent || parent.listId !== task.listId || parent.id === task.id || parent.parentTaskId !== null) {
        errors.push(`Task ${task.id} references an invalid parent task.`);
      }
    }
  }

  const schedules = uniqueForeignRows(envelope.tasks.schedules, ({ taskId }) => taskId, "schedule", errors);
  for (const schedule of envelope.tasks.schedules) {
    if (!tasks.has(schedule.taskId)) errors.push(`Schedule references unknown task ${schedule.taskId}.`);
  }
  for (const item of envelope.tasks.checklistItems) {
    if (!tasks.has(item.taskId)) errors.push(`Checklist item ${item.id} references an unknown task.`);
  }
  const taskTagKeys = new Set<string>();
  for (const link of envelope.tasks.taskTags) {
    const key = `${link.taskId}:${link.tagId}`;
    if (taskTagKeys.has(key)) errors.push(`Task-tag relationship ${key} is duplicated.`);
    taskTagKeys.add(key);
    if (!tasks.has(link.taskId)) errors.push(`Task-tag relationship references unknown task ${link.taskId}.`);
    if (!tags.has(link.tagId)) errors.push(`Task-tag relationship references unknown tag ${link.tagId}.`);
  }

  uniqueForeignRows(
    envelope.tasks.recurrenceDefinitions,
    ({ taskId }) => taskId,
    "recurrence definition",
    errors,
  );
  for (const definition of envelope.tasks.recurrenceDefinitions) {
    const task = tasks.get(definition.taskId);
    if (!task) {
      errors.push(`Recurrence definition references unknown task ${definition.taskId}.`);
    } else {
      if (task.parentTaskId !== null) {
        errors.push(`Recurrence definition references non-root task ${definition.taskId}.`);
      }
      if (task.status === "completed" && recurrenceUpperCutover(definition) === null) {
        errors.push(
          `Completed task ${definition.taskId} has a recurrence definition without an upper cutover.`,
        );
      }
    }

    const schedule = schedules.get(definition.taskId);
    if (!schedule || schedule.kind !== definition.kind) {
      errors.push(`Recurrence definition for task ${definition.taskId} has no compatible schedule.`);
      continue;
    }
    if (definition.kind === "all_day" && schedule.kind === "all_day") {
      if (definition.projectionStartDate < schedule.startDate) {
        errors.push(`Recurrence definition for task ${definition.taskId} starts before its schedule anchor.`);
      }
    }
    if (definition.kind === "timed" && schedule.kind === "timed") {
      if (definition.timezone !== schedule.timezone) {
        errors.push(`Recurrence definition for task ${definition.taskId} has an incompatible timezone.`);
      }
      if (Date.parse(definition.projectionStartAt) < Date.parse(schedule.startAt)) {
        errors.push(`Recurrence definition for task ${definition.taskId} starts before its schedule anchor.`);
      }
    }
  }

  const occurrenceEventVersions = new Set<string>();
  for (const event of envelope.tasks.occurrenceEvents) {
    const versionKey = `${event.taskId}:${event.taskVersion}`;
    if (occurrenceEventVersions.has(versionKey)) {
      errors.push(`Occurrence event version ${versionKey} is duplicated.`);
    }
    occurrenceEventVersions.add(versionKey);

    const task = tasks.get(event.taskId);
    if (!task) {
      errors.push(`Occurrence event ${event.id} references an unknown task.`);
    } else {
      if (task.parentTaskId !== null) {
        errors.push(`Occurrence event ${event.id} references a non-root task.`);
      }
      if (event.taskVersion > task.version) {
        errors.push(`Occurrence event ${event.id} is newer than its owning task.`);
      }
    }
  }

  const proposalIds = new Set<string>();
  for (const record of envelope.assistant.proposals) {
    if (proposalIds.has(record.id)) errors.push(`Planner proposal ${record.id} is duplicated.`);
    proposalIds.add(record.id);
    for (const subject of record.proposal.subjects) {
      if (subject.taskId !== null && !tasks.has(subject.taskId)) {
        errors.push(`Planner proposal ${record.id} references an unknown task.`);
      }
    }
  }

  return errors;
}

function uniqueIds<T extends Readonly<{ id: string }>>(
  rows: readonly T[],
  label: string,
  errors: string[],
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const row of rows) {
    if (byId.has(row.id)) errors.push(`${capitalize(label)} ${row.id} is duplicated.`);
    byId.set(row.id, row);
  }
  return byId;
}

function uniqueForeignRows<T>(
  rows: readonly T[],
  keyFor: (row: T) => string,
  label: string,
  errors: string[],
): Map<string, T> {
  const rowsByKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyFor(row);
    if (rowsByKey.has(key)) errors.push(`${capitalize(label)} ${key} is duplicated.`);
    rowsByKey.set(key, row);
  }
  return rowsByKey;
}

function recurrenceUpperCutover(
  definition: UserExportEnvelope["tasks"]["recurrenceDefinitions"][number],
): string | null {
  return definition.kind === "all_day" ? definition.projectionEndDate : definition.projectionEndAt;
}

function capitalize(value: string) {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
