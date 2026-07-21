import { spawn } from "node:child_process";
import { resolve } from "node:path";

const builderCli = resolve("node_modules/electron-builder/cli.js");
const argumentsList = process.argv.slice(2).filter((argument) => argument !== "--");
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.NODE_OPTIONS;
const child = spawn(process.execPath, [builderCli, ...argumentsList], {
  env: environment,
  stdio: "inherit",
});
const exitCode = await new Promise((resolveCode, rejectCode) => {
  child.once("error", rejectCode);
  child.once("close", resolveCode);
});

if (exitCode !== 0) process.exitCode = exitCode ?? 1;
