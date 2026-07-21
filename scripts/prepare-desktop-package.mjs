import { cp, lstat, mkdir, realpath, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const supportedTargets = new Set(["windows-x64", "macos-x64", "macos-arm64"]);
const target = process.env.ELECTRON_DESKTOP_TARGET ?? detectTarget();
if (!supportedTargets.has(target)) {
  fail(`Unsupported desktop target ${target}. Use windows-x64, macos-x64, or macos-arm64.`);
}

const repositoryRoot = resolve(".");
const sourceRoot = resolve("desktop/runtime");
const outputRoot = resolve("dist-desktop-runtime");
const standaloneNodeModulesRoot = resolve(".next/standalone/node_modules");
const migrationRuntimePackages = ["drizzle-orm", "zod"];
if (dirname(outputRoot) !== repositoryRoot) {
  fail(`Refusing to prepare desktop resources outside the repository: ${outputRoot}`);
}
await refuseSymlink(outputRoot);

await requireFile(join(sourceRoot, "manifest.json"));
await requireFile(join(sourceRoot, "THIRD-PARTY-NOTICES.md"));
await requireDirectory(join(sourceRoot, "node", target));
await requireDirectory(join(sourceRoot, "postgres", target));

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });
await cp(join(sourceRoot, "manifest.json"), join(outputRoot, "manifest.json"));
await cp(join(sourceRoot, "THIRD-PARTY-NOTICES.md"), join(outputRoot, "THIRD-PARTY-NOTICES.md"));
await cp(join(sourceRoot, "node", target), join(outputRoot, "node", target), { recursive: true });
await cp(join(sourceRoot, "postgres", target), join(outputRoot, "postgres", target), {
  recursive: true,
});

await requireDirectory(standaloneNodeModulesRoot);
for (const packageName of migrationRuntimePackages) {
  const packageSource = await resolveInstalledPackage(packageName);
  const packageDestination = join(standaloneNodeModulesRoot, packageName);
  await rm(packageDestination, { force: true, recursive: true });
  await cp(packageSource, packageDestination, {
    dereference: true,
    recursive: true,
  });
}

console.log(`Prepared target-specific desktop resources for ${target} at ${outputRoot}.`);
console.log("Prepared migration runtime dependencies in the standalone server output.");

function detectTarget() {
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  if (process.platform === "darwin" && process.arch === "x64") return "macos-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "macos-arm64";
  fail(`Cannot infer a supported desktop target from ${process.platform}/${process.arch}.`);
}

async function refuseSymlink(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) fail(`Refusing to replace symlink ${path}.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function resolveInstalledPackage(packageName) {
  try {
    return await realpath(join(repositoryRoot, "node_modules", packageName));
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`Required migration runtime package is missing: ${packageName}. Run pnpm install first.`);
    }
    throw error;
  }
}

async function requireFile(path) {
  try {
    if (!(await stat(path)).isFile()) fail(`Expected a file at ${path}.`);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`Required desktop release file is missing: ${path}.`);
    throw error;
  }
}

async function requireDirectory(path) {
  try {
    if (!(await stat(path)).isDirectory()) fail(`Expected a directory at ${path}.`);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`Required desktop release directory is missing: ${path}.`);
    throw error;
  }
}

function fail(message) {
  console.error(`Desktop package preparation failed: ${message}`);
  process.exit(1);
}
