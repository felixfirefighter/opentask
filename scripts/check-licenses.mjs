import { execFileSync } from "node:child_process";

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "(MIT OR CC0-1.0)",
]);

const inventory = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8" }),
);
const licenses = Object.keys(inventory);
const rejected = licenses.filter((license) => !allowedLicenses.has(license));
const packageCount = Object.values(inventory).reduce((count, packages) => count + packages.length, 0);

if (rejected.length) {
  process.stderr.write(`Unreviewed production dependency licenses: ${rejected.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Production license inventory passed (${packageCount} packages; ${licenses.sort().join(", ")}).\n`,
  );
}
