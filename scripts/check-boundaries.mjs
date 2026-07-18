import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: process.cwd() });
const probes = [
  {
    filePath: "app/__forbidden_boundary_probe__.ts",
    source:
      'import { drizzle } from "drizzle-orm";\nimport "@/modules/visual-proof/presentation/TodayScreen";\nexport default drizzle;\n',
    expectedErrors: 2,
  },
  {
    filePath: "modules/boundary-probe/domain/forbidden.ts",
    source: 'import React from "react";\nimport { sql } from "drizzle-orm";\nexport { React, sql };\n',
    expectedErrors: 2,
  },
];

let observedErrors = 0;

for (const probe of probes) {
  const [result] = await eslint.lintText(probe.source, { filePath: probe.filePath });
  const boundaryErrors = result?.messages.filter(
    (message) => message.severity === 2 && message.ruleId === "no-restricted-imports",
  );

  if (boundaryErrors?.length !== probe.expectedErrors) {
    process.stderr.write(
      `Architecture probe ${probe.filePath} expected ${probe.expectedErrors} errors and received ${boundaryErrors?.length ?? 0}.\n`,
    );
    process.exitCode = 1;
  }

  observedErrors += boundaryErrors?.length ?? 0;
}

if (!process.exitCode) {
  process.stdout.write(
    `Architecture probes rejected (${observedErrors} errors across deep-import, database, and domain-framework violations).\n`,
  );
}
