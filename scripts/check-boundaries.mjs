import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ESLint } from "eslint";

import { createModuleLayerExportProbes } from "./boundary-probes/module-layer-export.mjs";
import { createPolicyControlProbes } from "./boundary-probes/policy-controls.mjs";
import { runtimeLoaderProbes } from "./boundary-probes/runtime-loader.mjs";
import { runtimeOutputProbes } from "./boundary-probes/runtime-output.mjs";

const probeModule = `__boundary_probe_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
const modulesRoot = resolve("modules");
const probeRoot = resolve(modulesRoot, probeModule);
const privateTarget = resolve(probeRoot, "private.ts");
const domainTarget = resolve(probeRoot, "domain", "value.ts");
const infrastructureTarget = resolve(probeRoot, "infrastructure", "repository.ts");
const presentationTarget = resolve(probeRoot, "presentation", "view.ts");

if (dirname(probeRoot) !== modulesRoot || !probeModule.startsWith("__boundary_probe_")) {
  throw new Error("Refusing to create an architecture probe outside the modules directory.");
}

const probes = [
  ...createModuleLayerExportProbes(probeModule),
  ...runtimeLoaderProbes,
  ...runtimeOutputProbes,
  ...createPolicyControlProbes(probeModule),
];
const eslint = new ESLint({ cwd: process.cwd() });
let observedErrors = 0;

try {
  await mkdir(dirname(domainTarget), { recursive: true });
  await mkdir(dirname(infrastructureTarget), { recursive: true });
  await mkdir(dirname(presentationTarget), { recursive: true });
  await writeFile(infrastructureTarget, "export const repository = true;\n", "utf8");
  await writeFile(domainTarget, "export const value = true;\n", "utf8");
  await writeFile(presentationTarget, "export const view = true;\n", "utf8");
  await writeFile(privateTarget, "export const privateValue = true;\n", "utf8");

  for (const probe of probes) {
    const [result] = await eslint.lintText(probe.source, { filePath: probe.filePath });
    const errors = result?.messages.filter((message) => message.severity === 2) ?? [];
    const actual = Object.fromEntries(
      [...new Set(errors.map((message) => message.ruleId ?? "unknown"))].map((ruleId) => [
        ruleId,
        errors.filter((message) => (message.ruleId ?? "unknown") === ruleId).length,
      ]),
    );

    const ruleIds = new Set([...Object.keys(actual), ...Object.keys(probe.expected)]);
    const matchesExpected = [...ruleIds].every(
      (ruleId) => (actual[ruleId] ?? 0) === (probe.expected[ruleId] ?? 0),
    );

    if (!matchesExpected) {
      process.stderr.write(
        `Architecture probe ${probe.filePath} expected ${JSON.stringify(probe.expected)} and received ${JSON.stringify(actual)}.\n`,
      );
      process.exitCode = 1;
    }

    observedErrors += errors.length;
  }
} finally {
  await rm(probeRoot, { recursive: true, force: true });
}

if (!process.exitCode) {
  process.stdout.write(
    `Architecture probes rejected (${observedErrors} violations across layers, modules, database access, runtime imports, and logging).\n`,
  );
}
