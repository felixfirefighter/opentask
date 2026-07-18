import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

import { architectureBoundaries } from "./scripts/eslint/architecture-boundaries.mjs";
import { importSafety } from "./scripts/eslint/import-safety.mjs";
import { runtimeSafety } from "./scripts/eslint/runtime-safety.mjs";

const localCode = [
  "app/**/*.{ts,tsx}",
  "modules/**/*.{ts,tsx}",
  "scripts/**/*.{ts,tsx,mjs}",
  "shared/**/*.{ts,tsx}",
  "worker/**/*.{ts,tsx}",
];

const sharedDatabasePattern = {
  group: ["@/shared/db", "@/shared/db/**"],
  message: "Database access belongs behind the approved application/infrastructure boundary.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "artifacts/**"]),
  architectureBoundaries,
  {
    files: localCode,
    plugins: { opentask: { rules: { ...importSafety.rules, ...runtimeSafety.rules } } },
    rules: {
      "opentask/direct-node-modules": "error",
      "opentask/explicit-type-imports": "error",
      "opentask/literal-dynamic-imports": "error",
      "no-implied-eval": "error",
      "opentask/no-alternate-loaders": [
        "error",
        { packages: ["module", "node:module", "node:process", "node:vm", "process", "vm"] },
      ],
      "opentask/no-runtime-loader-escapes": "error",
    },
  },
  {
    files: ["modules/*/application/**/*.{ts,tsx}"],
    rules: {
      "opentask/no-private-runtime-reexports": "error",
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "modules/**/*.{ts,tsx}",
      "shared/**/*.{ts,tsx}",
      "worker/**/*.{ts,tsx}",
      "scripts/{migrate,seed}.ts",
    ],
    rules: {
      "opentask/no-unreviewed-output": "error",
    },
  },
  {
    files: localCode,
    ignores: ["shared/logging/logger.ts"],
    rules: {
      "opentask/no-raw-pino": ["error", { packages: ["pino"] }],
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "modules/*/{application,domain,presentation}/**/*.{ts,tsx}",
      "modules/*/index.ts",
      "shared/**/*.{ts,tsx}",
    ],
    ignores: ["shared/db/**/*.{ts,tsx}"],
    rules: {
      "opentask/no-data-packages": ["error", { packages: ["drizzle-orm", "pg", "pg-boss"] }],
    },
  },
  {
    files: ["worker/**/*.{ts,tsx}"],
    rules: {
      "opentask/no-data-packages": ["error", { packages: ["drizzle-orm", "pg"] }],
    },
  },
  {
    files: [
      "modules/*/{application,domain,infrastructure}/**/*.{ts,tsx}",
      "modules/*/index.ts",
      "shared/{auth,config,db,health,logging,time,validation}/**/*.{ts,tsx}",
      "worker/**/*.{ts,tsx}",
    ],
    rules: {
      "opentask/no-framework-packages": ["error", { packages: ["next", "react", "react-dom"] }],
    },
  },
  {
    files: [
      "app/**/*.{js,jsx,mjs,cjs,mts,cts}",
      "modules/**/*.{js,jsx,mjs,cjs,mts,cts}",
      "scripts/**/*.{js,jsx,cjs,mts,cts}",
      "shared/**/*.{js,jsx,mjs,cjs,mts,cts}",
      "worker/**/*.{js,jsx,mjs,cjs,mts,cts}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "Product source must use TypeScript so architecture and type gates apply.",
        },
      ],
    },
  },
  {
    files: ["modules/**/*.{ts,tsx}"],
    ignores: [
      "modules/*/index.ts",
      "modules/*/{application,domain,infrastructure,presentation}/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "Module source must live in an approved layer; only index.ts belongs at the root.",
        },
      ],
    },
  },
  {
    files: ["modules/*/{application,domain,infrastructure}/**/*.tsx", "modules/*/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "React components belong in a module presentation layer.",
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [sharedDatabasePattern] }],
    },
  },
  {
    files: ["modules/*/{domain,presentation}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [sharedDatabasePattern] }],
    },
  },
  {
    files: ["worker/**/*.{ts,tsx}", "scripts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/**"],
              message: "Node-executed TypeScript must use explicit relative imports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["shared/presentation/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [sharedDatabasePattern] }],
    },
  },
  {
    files: ["modules/*/index.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [sharedDatabasePattern] }],
    },
  },
]);
