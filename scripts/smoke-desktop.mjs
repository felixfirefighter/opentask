import { spawn } from "node:child_process";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

class SmokeError extends Error {}

const options = parseArguments(process.argv.slice(2));
const appDirectory = resolve(requiredOption(options, "app-dir"));
const timeoutMs = Number(options.get("timeout-ms") ?? 60_000);
if (!Number.isFinite(timeoutMs) || timeoutMs < 5_000) fail("--timeout-ms must be at least 5000.");

const executable = getExecutable(appDirectory);
const userDataPath = resolve(
  options.get("user-data") ?? (await mkdtemp(join(tmpdir(), "opentask-electron-smoke-"))),
);
const child = spawn(executable, [], {
  env: {
    ...process.env,
    OPENTASK_SMOKE_MODE: "1",
    OPENTASK_USER_DATA_PATH: userDataPath,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let stdout = "";
let stderr = "";
child.stdout?.on("data", (chunk) => (stdout = `${stdout}${chunk}`.slice(-4_000)));
child.stderr?.on("data", (chunk) => (stderr = `${stderr}${chunk}`.slice(-4_000)));

try {
  await waitForFiles(
    [join(userDataPath, "instance-secret"), join(userDataPath, "postgres-data", "PG_VERSION")],
    child,
    timeoutMs,
  );
  const exit = await waitForExit(child, timeoutMs);
  if (exit.code !== 0 || exit.signal) {
    failWithDiagnostics(
      `Desktop smoke exited unsuccessfully (${exit.code ?? "null"}/${exit.signal ?? "null"}).`,
      stdout,
      stderr,
    );
  }
  if (await fileExists(join(userDataPath, "postgres-data", "postmaster.pid"))) {
    fail("PostgreSQL still has postmaster.pid after graceful desktop shutdown.");
  }
  console.log(JSON.stringify({ status: "passed", appDirectory, userDataPath }));
} catch (error) {
  if (child.exitCode === null) child.kill();
  if (error instanceof SmokeError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}

function getExecutable(directory) {
  if (process.platform === "darwin") return join(directory, "Contents", "MacOS", "OpenTask");
  if (process.platform === "win32") return join(directory, "OpenTask.exe");
  fail(`Unsupported smoke platform ${process.platform}.`);
}

async function waitForFiles(files, processChild, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (processChild.exitCode !== null) {
      failWithDiagnostics(
        `Desktop exited before startup completed (code ${processChild.exitCode}).`,
        stdout,
        stderr,
      );
    }
    if (await Promise.all(files.map(fileExists)).then((results) => results.every(Boolean))) return;
    await delay(100);
  }
  failWithDiagnostics(`Desktop did not initialize local data within ${timeout}ms.`, stdout, stderr);
}

async function waitForExit(processChild, timeout) {
  if (processChild.exitCode !== null) return { code: processChild.exitCode, signal: null };
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(
      () => reject(new SmokeError(`Desktop did not shut down within ${timeout}ms.`)),
      timeout,
    );
    processChild.once("error", reject);
    processChild.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });
}

function parseArguments(argumentsList) {
  const result = new Map();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) fail(`Unexpected argument ${argument}.`);
    const name = argument.slice(2);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for --${name}.`);
    result.set(name, value);
    index += 1;
  }
  return result;
}

function requiredOption(optionsMap, name) {
  const value = optionsMap.get(name);
  if (!value) fail(`Missing required option --${name}.`);
  return value;
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  throw new SmokeError(message);
}

function failWithDiagnostics(message, output, errors) {
  const details = [
    `userData: ${userDataPath}`,
    message,
    output.trim() ? `stdout:\n${output.trim()}` : "",
    errors.trim() ? `stderr:\n${errors.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  throw new SmokeError(details);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
