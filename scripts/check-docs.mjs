import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const repositoryRoot = process.cwd();
const runFile = promisify(execFile);
const { stdout: markdownPaths } = await runFile(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
  { cwd: repositoryRoot },
);
const documents = markdownPaths
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((file) => resolve(repositoryRoot, file));
const failures = [];

for (const document of documents) {
  const source = await readFile(document, "utf8");
  for (const destination of markdownDestinations(source)) {
    await checkLocalTarget(document, destination);
  }
}

const manifestPath = resolve(repositoryRoot, "docs/MANIFEST.md");
const manifest = await readFile(manifestPath, "utf8");
for (const match of manifest.matchAll(/`([^`*]+\.md)`/gu)) {
  const target = match[1];
  if (target) await checkResolvedTarget(manifestPath, resolve(repositoryRoot, target), target);
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Documentation references resolve (${documents.length} Markdown files and manifest routes).\n`,
  );
}

function markdownDestinations(source) {
  return [...source.matchAll(/!?\[[^\]]*\]\(([^)\n]+)\)/gu)].map((match) => match[1]?.trim()).filter(Boolean);
}

async function checkLocalTarget(document, rawDestination) {
  const destination = extractDestination(rawDestination);
  if (!destination || destination.startsWith("#") || /^[a-z][a-z\d+.-]*:/iu.test(destination)) {
    return;
  }

  const pathOnly = destination.split(/[?#]/u, 1)[0];
  if (!pathOnly) return;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    failures.push(`${relative(document)}: invalid encoded link target ${destination}`);
    return;
  }
  await checkResolvedTarget(document, resolve(dirname(document), decodedPath), destination);
}

function extractDestination(rawDestination) {
  if (rawDestination.startsWith("<")) {
    const closing = rawDestination.indexOf(">");
    return closing === -1 ? rawDestination : rawDestination.slice(1, closing);
  }
  return rawDestination.split(/\s+/u, 1)[0];
}

async function checkResolvedTarget(document, target, displayTarget) {
  try {
    await access(target);
  } catch {
    failures.push(`${relative(document)}: missing local reference ${displayTarget}`);
  }
}

function relative(file) {
  return file.slice(repositoryRoot.length + 1);
}
