import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";

const targets = new Set(["windows-x64", "macos-x64", "macos-arm64"]);
const executableNames = ["postgres", "initdb", "createdb", "pg_ctl", "psql"];

const options = parseArguments(process.argv.slice(2));
const target = requiredOption(options, "target");
if (!targets.has(target)) {
  fail(`Unsupported target ${target}. Use windows-x64, macos-x64, or macos-arm64.`);
}

const nodePath = resolve(requiredOption(options, "node"));
const nodeArchive = resolve(requiredOption(options, "node-archive"));
const postgresPath = resolve(requiredOption(options, "postgres"));
const postgresArchive = resolve(requiredOption(options, "postgres-archive"));
const nodeVersion = requiredOption(options, "node-version");
const nodeSourceUrl = requiredOption(options, "node-source-url");
const postgresVersion = requiredOption(options, "postgres-version");
const postgresSourceUrl = requiredOption(options, "postgres-source-url");
const nodeLicense = options.get("node-license") ?? "MIT license";
const postgresLicense = options.get("postgres-license") ?? "PostgreSQL License";
validateUrl(nodeSourceUrl, "node-source-url");
validateUrl(postgresSourceUrl, "postgres-source-url");

const nodeArchiveSha256 = await sha256(nodeArchive);
const postgresArchiveSha256 = await sha256(postgresArchive);
const nodeExecutable = join(nodePath, target.startsWith("windows") ? "node.exe" : "node");
const postgresBin = join(postgresPath, "bin");
const requiredPostgresFiles = executableNames.map((name) =>
  join(postgresBin, `${name}${target.startsWith("windows") ? ".exe" : ""}`),
);

await requireFile(nodeExecutable, "Node executable");
for (const file of requiredPostgresFiles) await requireFile(file, "PostgreSQL executable");
await requireDirectory(join(postgresPath, "lib"), "PostgreSQL lib directory");
await requireDirectory(join(postgresPath, "share"), "PostgreSQL share directory");
if (
  !(await directoryExists(join(postgresPath, "share", "postgresql"))) &&
  !(await directoryExists(join(postgresPath, "share", "extension")))
) {
  fail(`PostgreSQL share data is missing: ${join(postgresPath, "share")}`);
}
await requireFile(nodeArchive, "Node archive");
await requireFile(postgresArchive, "PostgreSQL archive");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = join(repositoryRoot, "desktop", "runtime");
const targetNodeRoot = join(runtimeRoot, "node", target);
const targetPostgresRoot = join(runtimeRoot, "postgres", target);

await ensureSafeGeneratedDirectory(targetNodeRoot, runtimeRoot);
await ensureSafeGeneratedDirectory(targetPostgresRoot, runtimeRoot);
await rm(targetNodeRoot, { recursive: true, force: true });
await rm(targetPostgresRoot, { recursive: true, force: true });
await mkdir(targetNodeRoot, { recursive: true });
await mkdir(targetPostgresRoot, { recursive: true });
await cp(nodeExecutable, join(targetNodeRoot, basename(nodeExecutable)));
for (const directory of ["bin", "lib", "share"]) {
  await cp(join(postgresPath, directory), join(targetPostgresRoot, directory), { recursive: true });
}

if (!target.startsWith("windows")) {
  await chmod(join(targetNodeRoot, "node"), 0o755);
  for (const name of executableNames) await chmod(join(targetPostgresRoot, "bin", name), 0o755);
}

const manifestPath = join(runtimeRoot, "manifest.json");
const manifest = await readManifest(manifestPath);
manifest.targets[target] = {
  node: {
    version: nodeVersion,
    sourceUrl: nodeSourceUrl,
    archiveSha256: nodeArchiveSha256,
    license: nodeLicense,
  },
  postgres: {
    version: postgresVersion,
    sourceUrl: postgresSourceUrl,
    archiveSha256: postgresArchiveSha256,
    license: postgresLicense,
  },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Staged desktop runtime for ${target}.`);
console.log(`- Node archive SHA-256: ${nodeArchiveSha256}`);
console.log(`- PostgreSQL archive SHA-256: ${postgresArchiveSha256}`);
console.log(`- Manifest: ${manifestPath}`);

function parseArguments(argumentsList) {
  const result = new Map();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
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
  if (!value) fail(`Missing required option --${name}.`);
  return value;
}

function validateUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`--${name} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:") fail(`--${name} must be an absolute HTTPS URL.`);
}

async function sha256(file) {
  const contents = await readFile(file);
  return createHash("sha256").update(contents).digest("hex");
}

async function readManifest(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Invalid runtime manifest.");
    return { schemaVersion: 1, targets: {}, ...parsed };
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, targets: {} };
    if (error instanceof SyntaxError) fail(`Invalid JSON in ${file}.`);
    throw error;
  }
}

async function requireFile(file, label) {
  try {
    if (!(await stat(file)).isFile()) fail(`${label} is not a file: ${file}`);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} is missing: ${file}`);
    throw error;
  }
}

async function requireDirectory(directory, label) {
  try {
    if (!(await stat(directory)).isDirectory()) fail(`${label} is not a directory: ${directory}`);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} is missing: ${directory}`);
    throw error;
  }
}

async function directoryExists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function ensureSafeGeneratedDirectory(directory, parent) {
  const directoryPath = resolve(directory);
  const parentPath = resolve(parent);
  if (directoryPath === parentPath || !directoryPath.startsWith(`${parentPath}/`)) {
    fail(`Refusing to replace a directory outside the runtime tree: ${directoryPath}`);
  }
  try {
    if ((await lstat(directoryPath)).isSymbolicLink())
      fail(`Refusing to replace a symlink: ${directoryPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function printHelp() {
  console.log(`Stage an already-extracted desktop runtime without downloading anything.

Required options:
  --target windows-x64|macos-x64|macos-arm64
  --node <executable directory containing node[.exe]>
  --node-archive <original Node archive>
  --node-version <pinned version>
  --node-source-url <HTTPS archive URL>
  --postgres <directory containing bin/, lib/, share/>
  --postgres-archive <original PostgreSQL archive>
  --postgres-version <pinned version>
  --postgres-source-url <HTTPS archive URL>

Optional:
  --node-license <notice label>
  --postgres-license <notice label>`);
  process.exit(0);
}

function fail(message) {
  console.error(`Runtime staging failed: ${message}`);
  process.exit(1);
}
