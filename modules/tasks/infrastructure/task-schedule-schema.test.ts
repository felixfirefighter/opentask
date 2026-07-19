import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import "@/shared/db/schema";
import { schema } from "@/shared/db/schema";

import { createTaskSchema } from "./schema";

const taskSchedules = createTaskSchema(() => schema.user.id).taskSchedules;

describe("task schedule schema", () => {
  it("owns one tenant-leading schedule row with strict discriminant and bound checks", () => {
    const config = getTableConfig(taskSchedules);
    expect(config.name).toBe("task_schedules");
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual(["user_id", "task_id"]);
    expect(config.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "task_schedules_task_owner_fk",
    );
    expect(config.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "task_schedules_kind_check",
        "task_schedules_shape_check",
        "task_schedules_bounds_check",
        "task_schedules_timezone_check",
      ]),
    );
  });

  it("provides four partial range indexes without a duplicate due field", () => {
    const config = getTableConfig(taskSchedules);
    expect(config.indexes.map(({ config: index }) => index.name).sort()).toEqual([
      "task_schedules_user_end_at_idx",
      "task_schedules_user_end_date_idx",
      "task_schedules_user_start_at_idx",
      "task_schedules_user_start_date_idx",
    ]);
    expect(config.columns.map(({ name }) => name)).not.toContain("due_at");
  });
});
