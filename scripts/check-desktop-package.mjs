import { access, readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const options = parseArguments(process.argv.slice(2));
const appDirectory = resolve(requiredOption(options, "app-dir"));
const resourcesDirectory = await getResourcesDirectory(appDirectory);
const target = options.get("target") ?? detectTarget();
const executableSuffix = target === "windows-x64" ? ".exe" : "";
const runtimeRoot = join(resourcesDirectory, "runtime");
const postgresRoot = join(runtimeRoot, "postgres", target);

const requiredFiles = [
  "app.asar",
  "next-server/server.js",
  "next-server/scripts/migrate.ts",
  "runtime/manifest.json",
  "runtime/THIRD-PARTY-NOTICES.md",
  `runtime/node/${target}/node${executableSuffix}`,
  ...["postgres", "initdb", "createdb", "pg_ctl", "psql"].map(
    (name) => `runtime/postgres/${target}/bin/${name}${executableSuffix}`,
  ),
  `runtime/postgres/${target}/lib`,
  `runtime/postgres/${target}/share`,
];

for (const relativePath of requiredFiles) await requirePath(join(resourcesDirectory, relativePath));

const packagedElectronFiles = [
  "dist-electron/main.js",
  "dist-electron/runtime.js",
  "dist-electron/runtime-process.js",
  "dist-electron/target.js",
  "dist-electron/preload.cjs",
];
const asarHeader = readAsarHeader(await readFile(join(resourcesDirectory, "app.asar")));
for (const relativePath of packagedElectronFiles) {
  if (!asarContainsFile(asarHeader, relativePath)) {
    fail(`Packaged Electron module is missing from app.asar: ${relativePath}`);
  }
}

const manifest = JSON.parse(await readFile(join(runtimeRoot, "manifest.json"), "utf8"));
if (!manifest.targets?.[target]) fail(`Runtime manifest is missing target ${target}.`);
if (
  !(await pathIsDirectory(join(postgresRoot, "share", "postgresql"))) &&
  !(await pathIsDirectory(join(postgresRoot, "share", "extension")))
) {
  fail(`PostgreSQL share data is missing for ${target}.`);
}

const forbiddenTopLevelEntries = new Set([
  ".env",
  ".env.local",
  "Dockerfile",
  "docker-compose.yml",
  "pnpm-lock.yaml",
  ".pnpm-store",
]);
const topLevelEntries = await readdir(resourcesDirectory);
const forbiddenEntries = topLevelEntries.filter((entry) => forbiddenTopLevelEntries.has(entry));
if (forbiddenEntries.length > 0) {
  fail(`Development files are present in packaged resources: ${forbiddenEntries.join(", ")}.`);
}

console.log(
  `Desktop package check passed (${basename(appDirectory)}; ${target}; ${requiredFiles.length} required paths, ${packagedElectronFiles.length} Electron modules).`,
);

function parseArguments(argumentsList) {
  const result = new Map();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (argument === "--help") printHelp();
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
  if (!value) printHelp(`Missing required option --${name}.`);
  return value;
}

function detectTarget() {
  if (process.platform === "win32") return "windows-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "macos-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "macos-x64";
  fail(`Cannot infer a supported desktop target from ${process.platform}/${process.arch}.`);
}

async function getResourcesDirectory(appDirectoryPath) {
  const macResources = join(appDirectoryPath, "Contents", "Resources");
  if (await pathIsDirectory(macResources)) return macResources;
  const windowsResources = join(appDirectoryPath, "resources");
  if (await pathIsDirectory(windowsResources)) return windowsResources;
  fail(`Cannot find Contents/Resources or resources under ${appDirectoryPath}.`);
}

async function requirePath(path) {
  try {
    await access(path);
  } catch {
    fail(`Packaged desktop path is missing: ${path}`);
  }
}

async function pathIsDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function readAsarHeader(archive) {
  const headerLength = archive.readUInt32LE(4);
  const header = archive.subarray(8, 8 + headerLength);
  const jsonLength = header.readUInt32LE(4);
  return JSON.parse(header.subarray(8, 8 + jsonLength).toString("utf8"));
}

function asarContainsFile(header, relativePath) {
  let node = header;
  for (const segment of relativePath.split("/")) {
    node = node.files?.[segment];
    if (!node) return false;
  }
  return typeof node.size === "number";
}

function printHelp(error) {
  if (error) console.error(error);
  console.error("Usage: node scripts/check-desktop-package.mjs --app-dir <unpacked-app> [--target <target>]");
  process.exit(1);
}

function fail(message) {
  console.error(`Desktop package check failed: ${message}`);
  process.exit(1);
}
