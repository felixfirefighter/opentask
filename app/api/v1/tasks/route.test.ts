import type * as TasksModule from "@/modules/tasks";
import { ApplicationError } from "@/shared/http/application-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  getTasksApplication: vi.fn(),
  tasks: {
    listTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    transitionTaskStatus: vi.fn(),
    moveTask: vi.fn(),
    positionTask: vi.fn(),
    deleteTask: vi.fn(),
    restoreTask: vi.fn(),
  },
  checklist: {
    createChecklistItem: vi.fn(),
    updateChecklistItem: vi.fn(),
    positionChecklistItem: vi.fn(),
    deleteChecklistItem: vi.fn(),
  },
  tags: { replaceTaskTags: vi.fn() },
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof TasksModule>()),
  getTasksApplication: mocks.getTasksApplication,
}));

import { POST as deleteChecklistItem } from "./[taskId]/checklist/[itemId]/delete/route";
import { POST as positionChecklistItem } from "./[taskId]/checklist/[itemId]/position/route";
import { PATCH as updateChecklistItem } from "./[taskId]/checklist/[itemId]/route";
import { POST as createChecklistItem } from "./[taskId]/checklist/route";
import { POST as deleteTask } from "./[taskId]/delete/route";
import { POST as moveTask } from "./[taskId]/move/route";
import { POST as positionTask } from "./[taskId]/position/route";
import { POST as restoreTask } from "./[taskId]/restore/route";
import { GET as getTask, PATCH as updateTask } from "./[taskId]/route";
import { POST as transitionTaskStatus } from "./[taskId]/status/route";
import { POST as replaceTaskTags } from "./[taskId]/tags/route";
import { GET as listTasks, POST as createTask } from "./route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const listId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const destinationListId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const itemId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const tagId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const now = "2026-07-19T01:02:03.000Z";

const taskValue = {
  id: taskId,
  listId,
  sectionId: null,
  parentTaskId: null,
  title: "Ship the demo",
  descriptionMd: "Verify the release",
  status: "open",
  priority: "high",
  rank: "a0",
  statusChangedAt: now,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};
const checklistValue = {
  id: itemId,
  taskId,
  title: "Record the walkthrough",
  isCompleted: false,
  rank: "a0",
  version: 1,
  createdAt: now,
  updatedAt: now,
};
const tagValue = {
  id: tagId,
  name: "Launch",
  colorToken: "coral",
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};
const taskDetail = { ...taskValue, checklistItems: [checklistValue], tags: [tagValue], subtasks: [] };

function taskContext(value = taskId.toUpperCase()) {
  return { params: Promise.resolve({ taskId: value }) };
}

function checklistContext(task = taskId.toUpperCase(), item = itemId.toUpperCase()) {
  return { params: Promise.resolve({ taskId: task, itemId: item }) };
}

function jsonMutation(
  path: string,
  body: unknown,
  method: "PATCH" | "POST" = "POST",
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function mutationCases() {
  return [
    {
      name: "task create",
      method: "POST" as const,
      path: "/api/v1/tasks",
      body: { title: "Ship the demo", listId },
      headers: { "idempotency-key": taskId },
      invoke: (request: Request) => createTask(request),
      operation: mocks.tasks.createTask,
      largeText: true,
    },
    {
      name: "task update",
      method: "PATCH" as const,
      path: `/api/v1/tasks/${taskId}`,
      body: { expectedVersion: 1, patch: { descriptionMd: "Updated" } },
      headers: {},
      invoke: (request: Request) => updateTask(request, taskContext()),
      operation: mocks.tasks.updateTask,
      largeText: true,
    },
    {
      name: "task status",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/status`,
      body: { expectedVersion: 1, status: "completed" },
      headers: {},
      invoke: (request: Request) => transitionTaskStatus(request, taskContext()),
      operation: mocks.tasks.transitionTaskStatus,
      largeText: false,
    },
    {
      name: "task move",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/move`,
      body: {
        expectedVersion: 1,
        listId: destinationListId,
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "end" },
      },
      headers: {},
      invoke: (request: Request) => moveTask(request, taskContext()),
      operation: mocks.tasks.moveTask,
      largeText: false,
    },
    {
      name: "task position",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/position`,
      body: { expectedVersion: 1, placement: { kind: "start" } },
      headers: {},
      invoke: (request: Request) => positionTask(request, taskContext()),
      operation: mocks.tasks.positionTask,
      largeText: false,
    },
    {
      name: "task delete",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/delete`,
      body: { expectedVersion: 1 },
      headers: {},
      invoke: (request: Request) => deleteTask(request, taskContext()),
      operation: mocks.tasks.deleteTask,
      largeText: false,
    },
    {
      name: "task restore",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/restore`,
      body: { expectedVersion: 1 },
      headers: {},
      invoke: (request: Request) => restoreTask(request, taskContext()),
      operation: mocks.tasks.restoreTask,
      largeText: false,
    },
    {
      name: "checklist create",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/checklist`,
      body: { title: "Record the walkthrough" },
      headers: { "idempotency-key": itemId },
      invoke: (request: Request) => createChecklistItem(request, taskContext()),
      operation: mocks.checklist.createChecklistItem,
      largeText: false,
    },
    {
      name: "checklist update",
      method: "PATCH" as const,
      path: `/api/v1/tasks/${taskId}/checklist/${itemId}`,
      body: { expectedVersion: 1, patch: { isCompleted: true } },
      headers: {},
      invoke: (request: Request) => updateChecklistItem(request, checklistContext()),
      operation: mocks.checklist.updateChecklistItem,
      largeText: false,
    },
    {
      name: "checklist position",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/checklist/${itemId}/position`,
      body: { expectedVersion: 1, placement: { kind: "end" } },
      headers: {},
      invoke: (request: Request) => positionChecklistItem(request, checklistContext()),
      operation: mocks.checklist.positionChecklistItem,
      largeText: false,
    },
    {
      name: "checklist delete",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/checklist/${itemId}/delete`,
      body: { expectedVersion: 1 },
      headers: {},
      invoke: (request: Request) => deleteChecklistItem(request, checklistContext()),
      operation: mocks.checklist.deleteChecklistItem,
      largeText: false,
    },
    {
      name: "task tag replacement",
      method: "POST" as const,
      path: `/api/v1/tasks/${taskId}/tags`,
      body: { expectedVersion: 1, tagIds: [tagId] },
      headers: {},
      invoke: (request: Request) => replaceTaskTags(request, taskContext()),
      operation: mocks.tags.replaceTaskTags,
      largeText: false,
    },
  ];
}

function requestFor(
  testCase: ReturnType<typeof mutationCases>[number],
  options: { body?: unknown; headers?: Record<string, string>; method?: "PATCH" | "POST" } = {},
) {
  return jsonMutation(testCase.path, options.body ?? testCase.body, options.method ?? testCase.method, {
    ...testCase.headers,
    ...options.headers,
  });
}

async function expectPrivateJson(response: Response, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const value = await response.json();
  expect(JSON.stringify(value)).not.toContain("userId");
  expect(JSON.stringify(value)).not.toContain("user_id");
  return value;
}

describe("task, checklist, and task-tag API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getTasksApplication.mockReturnValue({
      tasks: mocks.tasks,
      checklist: mocks.checklist,
      tags: mocks.tags,
    });
    mocks.tasks.listTasks.mockResolvedValue({ items: [taskValue], nextCursor: null });
    mocks.tasks.getTask.mockResolvedValue(taskDetail);
    mocks.tasks.createTask.mockResolvedValue({ created: true, value: taskValue });
    mocks.tasks.updateTask.mockResolvedValue({ ...taskValue, version: 2 });
    mocks.tasks.transitionTaskStatus.mockResolvedValue({ ...taskValue, status: "completed", version: 2 });
    mocks.tasks.moveTask.mockResolvedValue({ ...taskValue, listId: destinationListId, version: 2 });
    mocks.tasks.positionTask.mockResolvedValue({ ...taskValue, rank: "a1", version: 2 });
    mocks.tasks.deleteTask.mockResolvedValue({ ...taskValue, deletedAt: now, version: 2 });
    mocks.tasks.restoreTask.mockResolvedValue({ ...taskValue, version: 2 });
    mocks.checklist.createChecklistItem.mockResolvedValue({ created: true, value: checklistValue });
    mocks.checklist.updateChecklistItem.mockResolvedValue({
      ...checklistValue,
      isCompleted: true,
      version: 2,
    });
    mocks.checklist.positionChecklistItem.mockResolvedValue({ ...checklistValue, rank: "a1", version: 2 });
    mocks.checklist.deleteChecklistItem.mockResolvedValue(checklistValue);
    mocks.tags.replaceTaskTags.mockResolvedValue({
      task: { id: taskId, version: 2 },
      tags: [tagValue],
    });
  });

  it("lists strict task pages and returns a private task detail", async () => {
    const listResponse = await listTasks(
      new Request(`http://localhost:3000/api/v1/tasks?listId=${listId.toUpperCase()}&limit=10`),
    );
    await expectPrivateJson(listResponse);
    expect(mocks.tasks.listTasks).toHaveBeenCalledWith(actor, {
      listId,
      parentTaskId: null,
      status: "open",
      limit: 10,
    });

    const detailResponse = await getTask(
      new Request(`http://localhost:3000/api/v1/tasks/${taskId}`),
      taskContext(),
    );
    expect(await expectPrivateJson(detailResponse)).toEqual(taskDetail);
    expect(mocks.tasks.getTask).toHaveBeenCalledWith(actor, taskId);
  });

  it("creates tasks with UUID keys and distinguishes first create from replay", async () => {
    const first = await createTask(
      jsonMutation("/api/v1/tasks", { title: "Ship the demo", listId }, "POST", {
        "idempotency-key": taskId.toUpperCase(),
      }),
    );
    expect(await expectPrivateJson(first, 201)).toEqual(taskValue);
    expect(first.headers.get("location")).toBe(`/api/v1/tasks/${taskId}`);
    expect(mocks.tasks.createTask).toHaveBeenCalledWith(actor, taskId, {
      title: "Ship the demo",
      descriptionMd: "",
      priority: "none",
      listId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
    });

    mocks.tasks.createTask.mockResolvedValueOnce({ created: false, value: taskValue });
    const replay = await createTask(
      jsonMutation("/api/v1/tasks", { title: "Ship the demo", listId }, "POST", {
        "idempotency-key": taskId,
      }),
    );
    await expectPrivateJson(replay, 200);
    expect(replay.headers.get("location")).toBeNull();
  });

  it("updates task text and dispatches every lifecycle command with exact arguments", async () => {
    const updated = await updateTask(
      jsonMutation(
        `/api/v1/tasks/${taskId}`,
        { expectedVersion: 1, patch: { title: "Renamed", descriptionMd: "Updated" } },
        "PATCH",
      ),
      taskContext(),
    );
    await expectPrivateJson(updated);
    expect(mocks.tasks.updateTask).toHaveBeenCalledWith(actor, taskId, {
      expectedVersion: 1,
      patch: { title: "Renamed", descriptionMd: "Updated" },
    });

    const commands = [
      {
        response: transitionTaskStatus(
          jsonMutation(`/api/v1/tasks/${taskId}/status`, { expectedVersion: 1, status: "completed" }),
          taskContext(),
        ),
        operation: mocks.tasks.transitionTaskStatus,
        input: { expectedVersion: 1, status: "completed" },
      },
      {
        response: moveTask(
          jsonMutation(`/api/v1/tasks/${taskId}/move`, {
            expectedVersion: 2,
            listId: destinationListId,
            sectionId: null,
            parentTaskId: null,
            placement: { kind: "end" },
          }),
          taskContext(),
        ),
        operation: mocks.tasks.moveTask,
        input: {
          expectedVersion: 2,
          listId: destinationListId,
          sectionId: null,
          parentTaskId: null,
          placement: { kind: "end" },
        },
      },
      {
        response: positionTask(
          jsonMutation(`/api/v1/tasks/${taskId}/position`, {
            expectedVersion: 3,
            placement: { kind: "start" },
          }),
          taskContext(),
        ),
        operation: mocks.tasks.positionTask,
        input: { expectedVersion: 3, placement: { kind: "start" } },
      },
      {
        response: deleteTask(
          jsonMutation(`/api/v1/tasks/${taskId}/delete`, { expectedVersion: 4 }),
          taskContext(),
        ),
        operation: mocks.tasks.deleteTask,
        input: { expectedVersion: 4 },
      },
      {
        response: restoreTask(
          jsonMutation(`/api/v1/tasks/${taskId}/restore`, { expectedVersion: 5 }),
          taskContext(),
        ),
        operation: mocks.tasks.restoreTask,
        input: { expectedVersion: 5 },
      },
    ];
    for (const command of commands) {
      await expectPrivateJson(await command.response);
      expect(command.operation).toHaveBeenCalledWith(actor, taskId, command.input);
    }
  });

  it("creates, updates, positions, and deletes checklist items with exact scoped IDs", async () => {
    const created = await createChecklistItem(
      jsonMutation(`/api/v1/tasks/${taskId}/checklist`, { title: "Record the walkthrough" }, "POST", {
        "idempotency-key": itemId.toUpperCase(),
      }),
      taskContext(),
    );
    expect(await expectPrivateJson(created, 201)).toEqual(checklistValue);
    expect(created.headers.get("location")).toBe(`/api/v1/tasks/${taskId}/checklist/${itemId}`);
    expect(mocks.checklist.createChecklistItem).toHaveBeenCalledWith(actor, taskId, itemId, {
      title: "Record the walkthrough",
      placement: { kind: "end" },
    });

    mocks.checklist.createChecklistItem.mockResolvedValueOnce({ created: false, value: checklistValue });
    const replay = await createChecklistItem(
      jsonMutation(`/api/v1/tasks/${taskId}/checklist`, { title: "Record the walkthrough" }, "POST", {
        "idempotency-key": itemId,
      }),
      taskContext(),
    );
    await expectPrivateJson(replay, 200);
    expect(replay.headers.get("location")).toBeNull();

    const operations = [
      {
        response: updateChecklistItem(
          jsonMutation(
            `/api/v1/tasks/${taskId}/checklist/${itemId}`,
            { expectedVersion: 1, patch: { isCompleted: true } },
            "PATCH",
          ),
          checklistContext(),
        ),
        operation: mocks.checklist.updateChecklistItem,
        input: { expectedVersion: 1, patch: { isCompleted: true } },
      },
      {
        response: positionChecklistItem(
          jsonMutation(`/api/v1/tasks/${taskId}/checklist/${itemId}/position`, {
            expectedVersion: 2,
            placement: { kind: "start" },
          }),
          checklistContext(),
        ),
        operation: mocks.checklist.positionChecklistItem,
        input: { expectedVersion: 2, placement: { kind: "start" } },
      },
      {
        response: deleteChecklistItem(
          jsonMutation(`/api/v1/tasks/${taskId}/checklist/${itemId}/delete`, { expectedVersion: 3 }),
          checklistContext(),
        ),
        operation: mocks.checklist.deleteChecklistItem,
        input: { expectedVersion: 3 },
      },
    ];
    for (const operation of operations) {
      await expectPrivateJson(await operation.response);
      expect(operation.operation).toHaveBeenCalledWith(actor, taskId, itemId, operation.input);
    }
  });

  it("replaces task tags with the exact task CAS input and a private version reference", async () => {
    const response = await replaceTaskTags(
      jsonMutation(`/api/v1/tasks/${taskId}/tags`, { expectedVersion: 7, tagIds: [tagId] }),
      taskContext(),
    );
    expect(await expectPrivateJson(response)).toEqual({
      task: { id: taskId, version: 2 },
      tags: [tagValue],
    });
    expect(mocks.tags.replaceTaskTags).toHaveBeenCalledWith(actor, taskId, {
      expectedVersion: 7,
      tagIds: [tagId],
    });
  });

  it("rejects strict query, UUID path, body, create-key, and method violations", async () => {
    for (const query of [`listId=${listId}&limit=10&limit=20`, `listId=${listId}&unexpected=1`, "limit=10"]) {
      const response = await listTasks(new Request(`http://localhost:3000/api/v1/tasks?${query}`));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.tasks.listTasks).not.toHaveBeenCalled();

    const unexpectedDetailQuery = await getTask(
      new Request(`http://localhost:3000/api/v1/tasks/${taskId}?unexpected=1`),
      taskContext(),
    );
    const unexpectedCreateQuery = await createTask(
      jsonMutation("/api/v1/tasks?unexpected=1", { title: "Ship", listId }, "POST", {
        "idempotency-key": taskId,
      }),
    );
    expect(unexpectedDetailQuery.status).toBe(400);
    expect(unexpectedCreateQuery.status).toBe(400);
    expect(mocks.tasks.getTask).not.toHaveBeenCalled();
    expect(mocks.tasks.createTask).not.toHaveBeenCalled();

    const invalidTask = await getTask(
      new Request("http://localhost:3000/api/v1/tasks/not-a-uuid"),
      taskContext("not-a-uuid"),
    );
    expect(invalidTask.status).toBe(400);
    const invalidItem = await updateChecklistItem(
      jsonMutation(`/api/v1/tasks/${taskId}/checklist/not-a-uuid`, {
        expectedVersion: 1,
        patch: { isCompleted: true },
      }),
      checklistContext(taskId, "not-a-uuid"),
    );
    expect(invalidItem.status).toBe(400);

    for (const testCase of mutationCases()) {
      const unknownBody =
        typeof testCase.body === "object" && testCase.body !== null
          ? { ...testCase.body, unexpected: true }
          : testCase.body;
      expect((await testCase.invoke(requestFor(testCase, { body: unknownBody }))).status).toBe(400);
      expect(
        (
          await testCase.invoke(
            requestFor(testCase, { method: testCase.method === "PATCH" ? "POST" : "PATCH" }),
          )
        ).status,
      ).toBe(400);
      expect(testCase.operation).not.toHaveBeenCalled();
    }

    const missingTaskKey = await createTask(jsonMutation("/api/v1/tasks", { title: "Ship", listId }));
    const missingItemKey = await createChecklistItem(
      jsonMutation(`/api/v1/tasks/${taskId}/checklist`, { title: "Step" }),
      taskContext(),
    );
    expect(missingTaskKey.status).toBe(400);
    expect(missingItemKey.status).toBe(400);
  });

  it("rejects database-unsafe text and out-of-range versions before application calls", async () => {
    for (const unsafeText of ["\ud800", "\udc00", "contains\0null"]) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await createTask(
          jsonMutation("/api/v1/tasks", { title: unsafeText, listId }, "POST", {
            "idempotency-key": taskId,
          }),
        );
        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    }
    const oversizedVersion = await updateTask(
      jsonMutation(
        `/api/v1/tasks/${taskId}`,
        { expectedVersion: 2_147_483_648, patch: { title: "Still safe" } },
        "PATCH",
      ),
      taskContext(),
    );

    expect(oversizedVersion.status).toBe(400);
    expect(mocks.tasks.createTask).not.toHaveBeenCalled();
    expect(mocks.tasks.updateTask).not.toHaveBeenCalled();
  });

  it("enforces origin, JSON, and authentication before every mutation application call", async () => {
    for (const testCase of mutationCases()) {
      const crossOrigin = await testCase.invoke(
        requestFor(testCase, { headers: { origin: "https://attacker.invalid" } }),
      );
      expect(crossOrigin.status, `${testCase.name} origin`).toBe(403);
      expect(crossOrigin.headers.get("cache-control")).toBe("no-store");

      const nonJson = await testCase.invoke(
        requestFor(testCase, { headers: { "content-type": "text/plain" } }),
      );
      expect(nonJson.status, `${testCase.name} content type`).toBe(400);
      expect(testCase.operation).not.toHaveBeenCalled();
    }

    mocks.resolveActor.mockRejectedValue(
      Object.assign(new Error("session secret"), { code: "UNAUTHENTICATED" }),
    );
    for (const testCase of mutationCases()) {
      const response = await testCase.invoke(requestFor(testCase));
      expect(response.status, `${testCase.name} authentication`).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(await response.json())).not.toContain("session secret");
      expect(testCase.operation).not.toHaveBeenCalled();
    }

    const listResponse = await listTasks(new Request(`http://localhost:3000/api/v1/tasks?listId=${listId}`));
    const detailResponse = await getTask(
      new Request(`http://localhost:3000/api/v1/tasks/${taskId}`),
      taskContext(),
    );
    for (const response of [listResponse, detailResponse]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.tasks.listTasks).not.toHaveBeenCalled();
    expect(mocks.tasks.getTask).not.toHaveBeenCalled();
  });

  it("uses 96KiB only for task text bodies and 4KiB for every other mutation", async () => {
    const longText = "x".repeat(5_000);
    const largeCreate = await createTask(
      jsonMutation("/api/v1/tasks", { title: "Large body", descriptionMd: longText, listId }, "POST", {
        "idempotency-key": taskId,
      }),
    );
    expect(largeCreate.status).toBe(201);
    expect(mocks.tasks.createTask).toHaveBeenCalled();

    const largeUpdate = await updateTask(
      jsonMutation(
        `/api/v1/tasks/${taskId}`,
        { expectedVersion: 1, patch: { descriptionMd: longText } },
        "PATCH",
      ),
      taskContext(),
    );
    expect(largeUpdate.status).toBe(200);
    expect(mocks.tasks.updateTask).toHaveBeenCalled();

    mocks.tasks.createTask.mockClear();
    mocks.tasks.updateTask.mockClear();
    for (const testCase of mutationCases().filter(({ largeText: taskText }) => taskText)) {
      const response = await testCase.invoke(
        requestFor(testCase, { headers: { "content-length": "98305" } }),
      );
      expect(response.status, `${testCase.name} 96KiB limit`).toBe(400);
      expect(testCase.operation).not.toHaveBeenCalled();
    }
    for (const testCase of mutationCases().filter(({ largeText: taskText }) => !taskText)) {
      const response = await testCase.invoke(requestFor(testCase, { headers: { "content-length": "4097" } }));
      expect(response.status, `${testCase.name} 4KiB limit`).toBe(400);
      expect(testCase.operation).not.toHaveBeenCalled();
    }
  });

  it("maps application conflicts to stable private problems with only safe version metadata", async () => {
    mocks.tasks.updateTask.mockRejectedValueOnce(
      new ApplicationError("CONFLICT", "This record changed elsewhere.", { currentVersion: 4 }),
    );
    const response = await updateTask(
      jsonMutation(`/api/v1/tasks/${taskId}`, { expectedVersion: 1, patch: { title: "Renamed" } }, "PATCH"),
      taskContext(),
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      type: "urn:omplish:problem:conflict",
      code: "CONFLICT",
      currentVersion: 4,
    });
  });
});
