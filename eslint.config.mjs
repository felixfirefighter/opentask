import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "artifacts/**"]),
  {
    files: ["app/**/*.{ts,tsx}", "modules/**/*.{ts,tsx}", "worker/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*", "@/modules/*/*/**"],
              message: "Import another module through modules/<name>/index.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "drizzle-orm", message: "App routes must call module application contracts." },
            { name: "pg", message: "App routes must not query PostgreSQL directly." },
            { name: "pg-boss", message: "App routes must not operate the queue directly." },
          ],
          patterns: [
            {
              group: ["drizzle-orm/**"],
              message: "App routes must call module application contracts.",
            },
            {
              group: ["@/modules/*/*", "@/modules/*/*/**"],
              message: "Import a module through modules/<name>/index.ts.",
            },
            {
              group: ["@/shared/db", "@/shared/db/**"],
              message:
                "Database access belongs behind an application contract; health is the narrow exception.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["modules/*/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "next", "drizzle-orm", "pg", "pg-boss"],
          patterns: ["react/**", "next/**", "drizzle-orm/**", "@/shared/db", "@/shared/db/**"],
        },
      ],
    },
  },
  {
    files: ["modules/*/presentation/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["drizzle-orm", "pg", "pg-boss"],
          patterns: ["drizzle-orm/**", "@/shared/db", "@/shared/db/**"],
        },
      ],
    },
  },
]);
