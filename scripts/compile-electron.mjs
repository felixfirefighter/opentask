import { lstat, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const outputRoot = resolve("dist-electron");
if (dirname(outputRoot) !== resolve(".")) {
  throw new Error(`Refusing to clean Electron output outside the repository: ${outputRoot}`);
}

try {
  const stats = await lstat(outputRoot);
  if (stats.isSymbolicLink())
    throw new Error(`Refusing to clean Electron output through symlink ${outputRoot}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await rm(outputRoot, { force: true, recursive: true });

const typeScriptCli = resolve("node_modules/typescript/bin/tsc");
const child = spawn(process.execPath, [typeScriptCli, "-p", "tsconfig.electron.json"], { stdio: "inherit" });
const exitCode = await new Promise((resolveCode, rejectCode) => {
  child.once("error", rejectCode);
  child.once("close", resolveCode);
});
if (exitCode !== 0) process.exitCode = exitCode ?? 1;
