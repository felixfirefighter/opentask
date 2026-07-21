import { ESLint } from "eslint";

import { createModuleLayerExportProbes } from "./boundary-probes/module-layer-export.mjs";
import { createPolicyControlProbes } from "./boundary-probes/policy-controls.mjs";
import { runtimeLoaderProbes } from "./boundary-probes/runtime-loader.mjs";
import { runtimeOutputProbes } from "./boundary-probes/runtime-output.mjs";

const probes = [
  ...createModuleLayerExportProbes(),
  ...runtimeLoaderProbes,
  ...runtimeOutputProbes,
  ...createPolicyControlProbes(),
];
const eslint = new ESLint({ cwd: process.cwd() });
let observedErrors = 0;

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

if (!process.exitCode) {
  process.stdout.write(
    `Architecture probes rejected (${observedErrors} violations across layers, modules, database access, runtime imports, and logging).\n`,
  );
}
