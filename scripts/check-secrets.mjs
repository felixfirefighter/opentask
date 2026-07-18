import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const gitFiles = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
const fileResult =
  gitFiles.status === 0 && gitFiles.stdout
    ? gitFiles
    : spawnSync("rg", ["--files", "-0"], { encoding: "utf8" });

if (fileResult.status !== 0 || !fileResult.stdout) {
  process.stderr.write("Could not enumerate repository files for the secret scan.\n");
  process.exit(1);
}

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bgh[oprsu]_[A-Za-z0-9]{30,}\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bVAPID_PRIVATE_KEY\s*=\s*[^\s#]{16,}/u,
];

const findings = [];
const files = fileResult.stdout.split("\0").filter(Boolean);

for (const file of files) {
  let contents;

  try {
    contents = readFileSync(file);
  } catch {
    continue;
  }

  if (contents.includes(0)) continue;
  const text = contents.toString("utf8");

  if (patterns.some((pattern) => pattern.test(text))) findings.push(file);
}

if (findings.length) {
  process.stderr.write(`Potential secret material found in:\n${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Secret scan clean (${files.length} tracked repository files).\n`);
}
