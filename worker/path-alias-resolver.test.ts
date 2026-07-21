import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveWorkspaceImport } from "./path-alias-resolver";

describe("worker workspace alias resolver", () => {
  it("resolves only files and module indexes inside the repository", () => {
    expect(fileURLToPath(resolveWorkspaceImport("@/modules/tasks")!)).toMatch(
      /\/modules\/tasks\/index\.ts$/u,
    );
    expect(fileURLToPath(resolveWorkspaceImport("@/shared/config/environment")!)).toMatch(
      /\/shared\/config\/environment\.ts$/u,
    );
    expect(resolveWorkspaceImport("pg-boss")).toBeNull();
  });

  it.each([
    "@/../package.json",
    "@/worker/../package.json",
    "@//modules/tasks",
    "@/modules/tasks?private=1",
    "@/modules/tasks/package.json",
  ])("rejects traversal, unsafe, and non-TypeScript targets: %s", (specifier) => {
    expect(() => resolveWorkspaceImport(specifier)).toThrow(
      expect.objectContaining({ name: "WorkspaceAliasResolutionError" }),
    );
  });

  it("resolves extensionless relative TypeScript imports only for workspace parents", () => {
    const parentUrl = pathToFileURL(resolve(process.cwd(), "modules/tasks/index.ts")).href;
    expect(fileURLToPath(resolveWorkspaceImport("./application/public", parentUrl)!)).toMatch(
      /\/modules\/tasks\/application\/public\.ts$/u,
    );
    expect(resolveWorkspaceImport("./internal.js", "file:///outside/repository/module.js")).toBeNull();
    expect(() => resolveWorkspaceImport("../../../outside", parentUrl)).toThrow(
      expect.objectContaining({ name: "WorkspaceAliasResolutionError" }),
    );
  });

  it("lets the pinned Node worker import its release dependency graph", () => {
    const registerPath = resolve(process.cwd(), "worker/register-path-aliases.ts");
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        registerPath,
        "--eval",
        "await import('./worker/runtime.ts')",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
  });
});
