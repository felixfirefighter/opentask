import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "BlueOak-1.0.0",
  "(MIT OR CC0-1.0)",
]);

const inventory = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8" }),
);
const licenses = Object.keys(inventory);
const rejected = licenses.filter((license) => !allowedLicenses.has(license));
const packageCount = Object.values(inventory).reduce((count, packages) => count + packages.length, 0);
const reviewedFontAssets = [
  {
    asset: "app/fonts/InterVariable.woff2",
    license: "app/fonts/licenses/Inter-OFL.txt",
    runtimeLicense: "licenses/fonts/Inter-OFL.txt",
    copyright: "The Inter Project Authors",
    sha256: "693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3",
  },
  {
    asset: "app/fonts/EBGaramondVariable.woff2",
    license: "app/fonts/licenses/EBGaramond-OFL.txt",
    runtimeLicense: "licenses/fonts/EBGaramond-OFL.txt",
    copyright: "The EB Garamond Project Authors",
    sha256: "7667eac47b012e7f92c14e2ec8b41d3b850e1e8d49e0db45f7417517866fb78a",
  },
];
const reviewedRuntimeDependencies = [
  {
    name: "rrule",
    version: "2.8.1",
    licenseId: "BSD-3-Clause",
    sourceLicense: "node_modules/rrule/LICENCE",
    repositoryLicense: "licenses/third-party/rrule-LICENCE.txt",
    runtimeLicense: "licenses/third-party/rrule-LICENCE.txt",
  },
  {
    name: "web-push",
    version: "3.6.7",
    licenseId: "MPL-2.0",
    sourceLicense: "node_modules/web-push/LICENSE",
    repositoryLicense: "licenses/third-party/web-push-LICENSE.txt",
    runtimeLicense: "licenses/third-party/web-push-LICENSE.txt",
  },
];

const assetFailures = [];
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const dockerfileLines = readFileSync("Dockerfile", "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim());
const runnerLine = dockerfileLines.indexOf("FROM base AS runner");
const runtimeUserLine = dockerfileLines.indexOf("USER opentask", runnerLine + 1);

if (runnerLine === -1 || runtimeUserLine === -1) {
  assetFailures.push("Dockerfile: missing the reviewed runner stage or runtime user boundary");
}

for (const font of reviewedFontAssets) {
  const bytes = readFileSync(font.asset);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== font.sha256) {
    assetFailures.push(`${font.asset}: expected ${font.sha256}, received ${actualHash}`);
  }

  const notice = readFileSync(font.license, "utf8");
  if (!notice.includes(font.copyright) || !notice.includes("SIL OPEN FONT LICENSE Version 1.1")) {
    assetFailures.push(`${font.license}: missing the reviewed copyright/OFL 1.1 notice`);
  }

  const expectedCopy = `COPY --from=builder --chown=opentask:nodejs /app/${font.license} ./${font.runtimeLicense}`;
  const copyLine = dockerfileLines.indexOf(expectedCopy, runnerLine + 1);
  if (copyLine === -1 || copyLine >= runtimeUserLine) {
    assetFailures.push(
      `Dockerfile: must copy ${font.license} to /app/${font.runtimeLicense} in the runner stage before USER opentask`,
    );
  }
}

for (const dependency of reviewedRuntimeDependencies) {
  if (packageJson.dependencies?.[dependency.name] !== dependency.version) {
    assetFailures.push(
      `package.json: ${dependency.name} must stay pinned to reviewed version ${dependency.version}`,
    );
    continue;
  }

  const installedPackage = JSON.parse(readFileSync(`node_modules/${dependency.name}/package.json`, "utf8"));
  if (installedPackage.version !== dependency.version || installedPackage.license !== dependency.licenseId) {
    assetFailures.push(
      `${dependency.name}: expected ${dependency.version}/${dependency.licenseId}, received ${installedPackage.version}/${installedPackage.license}`,
    );
  }

  const upstreamNotice = readFileSync(dependency.sourceLicense, "utf8").replaceAll("\r\n", "\n");
  const repositoryNotice = readFileSync(dependency.repositoryLicense, "utf8").replaceAll("\r\n", "\n");
  if (repositoryNotice !== upstreamNotice) {
    assetFailures.push(`${dependency.repositoryLicense}: must exactly match ${dependency.sourceLicense}`);
  }

  const expectedCopy = `COPY --from=builder --chown=opentask:nodejs /app/${dependency.repositoryLicense} ./${dependency.runtimeLicense}`;
  const copyLine = dockerfileLines.indexOf(expectedCopy, runnerLine + 1);
  if (copyLine === -1 || copyLine >= runtimeUserLine) {
    assetFailures.push(
      `Dockerfile: must copy ${dependency.repositoryLicense} to /app/${dependency.runtimeLicense} in the runner stage before USER opentask`,
    );
  }
}

if (rejected.length || assetFailures.length) {
  if (rejected.length) {
    process.stderr.write(`Unreviewed production dependency licenses: ${rejected.join(", ")}\n`);
  }
  for (const failure of assetFailures) process.stderr.write(`Reviewed asset check failed: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Production license inventory passed (${packageCount} packages; ${reviewedFontAssets.length} vendored OFL fonts; ${reviewedRuntimeDependencies.length} reviewed runtime notice; ${licenses.sort().join(", ")}).\n`,
  );
}
