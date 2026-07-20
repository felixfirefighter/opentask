import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { getDesktopTarget, getExecutableSuffix } from "./target.ts";

const supportedTargets = ["windows-x64", "macos-x64", "macos-arm64"] as const;
const targetArgumentIndex = process.argv.indexOf("--target");
const requestedTarget =
  process.env.ELECTRON_DESKTOP_TARGET ??
  (targetArgumentIndex >= 0 ? process.argv[targetArgumentIndex + 1] : undefined);
if (requestedTarget && !supportedTargets.includes(requestedTarget as (typeof supportedTargets)[number])) {
  console.error(`Unsupported target ${requestedTarget}.`);
  process.exitCode = 1;
}

const targets = process.argv.includes("--all")
  ? [...supportedTargets]
  : [requestedTarget ?? getDesktopTarget()];

const missing: string[] = [];
const runtimeRoot = join("desktop", "runtime");
const manifestPath = join(runtimeRoot, "manifest.json");
let manifest: { targets?: Record<string, unknown> } | undefined;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { targets?: Record<string, unknown> };
} catch {
  missing.push(manifestPath);
}

for (const target of targets) {
  const executable = getExecutableSuffix(target.startsWith("windows") ? "win32" : "darwin");
  if (!manifest?.targets?.[target]) missing.push(`manifest target ${target}`);
  const required = [
    join(runtimeRoot, "node", target, `node${executable}`),
    join(runtimeRoot, "postgres", target, "bin", `postgres${executable}`),
    join(runtimeRoot, "postgres", target, "bin", `initdb${executable}`),
    join(runtimeRoot, "postgres", target, "bin", `createdb${executable}`),
    join(runtimeRoot, "postgres", target, "bin", `pg_ctl${executable}`),
    join(runtimeRoot, "postgres", target, "bin", `psql${executable}`),
    join(runtimeRoot, "postgres", target, "lib"),
    join(runtimeRoot, "postgres", target, "share"),
  ];
  for (const file of required) {
    try {
      await access(file);
    } catch {
      missing.push(file);
    }
  }
  const shareDataDirectories = [
    join(runtimeRoot, "postgres", target, "share", "postgresql"),
    join(runtimeRoot, "postgres", target, "share", "extension"),
  ];
  if (!(await hasAnyDirectory(shareDataDirectories))) {
    missing.push(`${join(runtimeRoot, "postgres", target, "share")} (postgresql or extension data)`);
  }
}

if (missing.length > 0) {
  console.error("Desktop runtime artifacts are missing:");
  for (const file of missing) console.error(`- ${file}`);
  console.error("Stage the pinned Node and PostgreSQL binaries described in desktop/runtime/README.md.");
  process.exitCode = 1;
}

async function hasAnyDirectory(directories: readonly string[]): Promise<boolean> {
  for (const directory of directories) {
    try {
      await access(directory);
      return true;
    } catch {
      // Try the next platform-specific PostgreSQL share layout.
    }
  }
  return false;
}
