import { realpathSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const safeSegmentPattern = /^[A-Za-z0-9._-]+$/u;

export function resolveWorkspaceImport(specifier: string, parentUrl?: string): string | null {
  if (specifier.startsWith("@/")) return resolveWorkspaceAlias(specifier);
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  if (!parentUrl?.startsWith("file:")) return null;

  let parentPath: string;
  try {
    parentPath = realpathSync(fileURLToPath(parentUrl));
  } catch {
    return null;
  }
  if (!isWorkspaceSource(parentPath)) return null;
  if (/[\\\0?#]/u.test(specifier)) throw invalidWorkspaceAlias(specifier);

  const unresolved = resolve(dirname(parentPath), specifier);
  if (!unresolved.startsWith(`${workspaceRoot}${sep}`)) {
    throw invalidWorkspaceAlias(specifier);
  }
  return resolveTypeScriptTarget(specifier, unresolved);
}

function resolveWorkspaceAlias(specifier: string): string {
  const segments = specifier.slice(2).split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === ".." || !safeSegmentPattern.test(segment),
    )
  ) {
    throw invalidWorkspaceAlias(specifier);
  }

  const unresolved = resolve(workspaceRoot, ...segments);
  if (!unresolved.startsWith(`${workspaceRoot}${sep}`)) {
    throw invalidWorkspaceAlias(specifier);
  }

  return resolveTypeScriptTarget(specifier, unresolved);
}

function resolveTypeScriptTarget(specifier: string, unresolved: string): string {
  const extension = extname(unresolved);
  const candidates =
    extension === ".ts" || extension === ".tsx"
      ? [unresolved]
      : [`${unresolved}.ts`, `${unresolved}.tsx`, resolve(unresolved, "index.ts")];
  for (const candidate of candidates) {
    try {
      const target = realpathSync(candidate);
      if (!target.startsWith(`${workspaceRoot}${sep}`) || !statSync(target).isFile()) continue;
      return pathToFileURL(target).href;
    } catch {
      // Continue through the bounded candidate list without exposing local path details.
    }
  }

  throw invalidWorkspaceAlias(specifier);
}

function isWorkspaceSource(path: string): boolean {
  return path.startsWith(`${workspaceRoot}${sep}`) && !path.includes(`${sep}node_modules${sep}`);
}

function invalidWorkspaceAlias(specifier: string): Error {
  const error = new Error(`Workspace alias cannot be resolved: ${specifier}`);
  error.name = "WorkspaceAliasResolutionError";
  return error;
}
