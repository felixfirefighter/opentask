import { access, mkdtemp, readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { startDesktopRuntime } from "../dist-electron/runtime.js";

class SmokeError extends Error {}

const options = parseArguments(process.argv.slice(2));
const appDirectory = resolve(requiredOption(options, "app-dir"));
const resourcesPath = await getResourcesPath(appDirectory);
const userDataPath = resolve(
  options.get("user-data") ?? (await mkdtemp(join(tmpdir(), "omplish-runtime-smoke-"))),
);

let runtime;
try {
  runtime = await startDesktopRuntime({
    mode: "production",
    projectRoot: join(resourcesPath, "next-server"),
    resourcesPath,
    userDataPath,
  });
  await checkHealth(runtime.serverUrl);
  const sessionCookie = await createLocalSession(runtime.serverUrl);
  const firstSecret = await readSecret(userDataPath);
  await runtime.stop();
  runtime = undefined;

  await requireStoppedDatabase(userDataPath);
  runtime = await startDesktopRuntime({
    mode: "production",
    projectRoot: join(resourcesPath, "next-server"),
    resourcesPath,
    userDataPath,
  });
  await checkHealth(runtime.serverUrl);
  await requireAuthenticatedSession(runtime.serverUrl, sessionCookie);
  const secondSecret = await readSecret(userDataPath);
  if (firstSecret !== secondSecret) throw new SmokeError("The local instance secret changed between starts.");

  await runtime.stop();
  runtime = undefined;
  await requireStoppedDatabase(userDataPath);

  console.log(JSON.stringify({ status: "passed", appDirectory, resourcesPath, userDataPath, coldStarts: 2 }));
} catch (error) {
  if (runtime) await runtime.stop().catch(() => undefined);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function getResourcesPath(appDirectoryPath) {
  const macResources = join(appDirectoryPath, "Contents", "Resources");
  if (await pathIsDirectory(macResources)) return macResources;
  const windowsResources = join(appDirectoryPath, "resources");
  if (await pathIsDirectory(windowsResources)) return windowsResources;
  throw new SmokeError(`Cannot find packaged resources under ${appDirectoryPath}.`);
}

async function checkHealth(serverUrl) {
  const [live, ready] = await Promise.all([
    fetch(`${serverUrl}/api/health/live`),
    fetch(`${serverUrl}/api/health/ready`),
  ]);
  if (!live.ok || !ready.ok) {
    throw new SmokeError(`Health checks failed: live=${live.status}, ready=${ready.status}.`);
  }

  const readyBody = await ready.json();
  if (readyBody.status !== "ready") throw new SmokeError("Readiness endpoint did not return status=ready.");
}

async function createLocalSession(serverUrl) {
  const credentials = {
    email: `desktop-smoke-${randomUUID()}@example.test`,
    password: "correct horse battery staple",
  };
  const headers = {
    "content-type": "application/json",
    origin: serverUrl,
    "x-real-ip": "127.0.0.1",
  };
  const signUp = await fetch(`${serverUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify(credentials),
  });
  if (!signUp.ok) throw new SmokeError(`Local account creation failed with HTTP ${signUp.status}.`);

  const signIn = await fetch(`${serverUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify(credentials),
  });
  if (!signIn.ok) throw new SmokeError(`Local account sign-in failed with HTTP ${signIn.status}.`);
  const cookies = signIn.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((value) => value.split(";", 1)[0]).join("; ");
  if (!cookie) throw new SmokeError("Local account sign-in did not return a session cookie.");
  return cookie;
}

async function requireAuthenticatedSession(serverUrl, cookie) {
  const response = await fetch(`${serverUrl}/api/auth/get-session`, {
    headers: { cookie, origin: serverUrl, "x-real-ip": "127.0.0.1" },
  });
  if (!response.ok) throw new SmokeError(`Authenticated session check failed with HTTP ${response.status}.`);
  const session = await response.json();
  if (!session?.user?.id) throw new SmokeError("Authenticated session response did not contain a user.");
}

async function readSecret(userDataDirectory) {
  const secret = (await readFile(join(userDataDirectory, "instance-secret"), "utf8")).trim();
  if (secret.length < 32) throw new SmokeError("The local instance secret is missing or invalid.");
  return secret;
}

async function requireStoppedDatabase(userDataDirectory) {
  if (await pathExists(join(userDataDirectory, "postgres-data", "postmaster.pid"))) {
    throw new SmokeError("PostgreSQL still has postmaster.pid after runtime shutdown.");
  }
}

function parseArguments(argumentsList) {
  const result = new Map();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) throw new SmokeError(`Unexpected argument ${argument}.`);
    const name = argument.slice(2);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) throw new SmokeError(`Missing value for --${name}.`);
    result.set(name, value);
    index += 1;
  }
  return result;
}

function requiredOption(optionsMap, name) {
  const value = optionsMap.get(name);
  if (!value) throw new SmokeError(`Missing required option --${name}.`);
  return value;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function pathIsDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
