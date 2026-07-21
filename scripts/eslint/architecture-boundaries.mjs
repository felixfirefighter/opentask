import { createConfig } from "eslint-plugin-boundaries/config";

const sameModule = "{{ from.element.captured.module }}";
const moduleIndex = { element: { types: "module", fileInternalPath: "index.ts" } };
const presentationEntry = {
  element: { types: "module-layer", captured: { layer: "presentation" } },
  file: { categories: "module-presentation-entry" },
};
const moduleSchemaEntry = {
  element: { types: "module-layer", captured: { layer: "infrastructure" } },
  file: { categories: "module-schema-entry" },
};
const schemaComposition = {
  element: { types: "shared", captured: { surface: "db" } },
  file: { categories: "schema-composition" },
};

export const architectureBoundaries = createConfig({
  files: [
    "app/**/*.{ts,tsx}",
    "modules/**/*.{ts,tsx}",
    "server/**/*.{ts,tsx}",
    "shared/**/*.{ts,tsx}",
    "worker/**/*.{ts,tsx}",
  ],
  settings: {
    "boundaries/root-path": process.cwd(),
    "boundaries/elements-single-type": true,
    "boundaries/legacy-templates": false,
    "boundaries/dependency-nodes": ["import", "export", "dynamic-import", "require"],
    "boundaries/files": [
      { category: "module-presentation-entry", pattern: "modules/*/presentation/index.ts" },
      { category: "module-schema-entry", pattern: "modules/*/infrastructure/schema.ts" },
      { category: "schema-composition", pattern: "shared/db/schema.ts" },
    ],
    "boundaries/elements": [
      {
        type: "module-layer",
        pattern: "modules/*/*",
        capture: ["module", "layer"],
        partialMatch: false,
      },
      {
        type: "module",
        pattern: "modules/*",
        capture: ["module"],
        partialMatch: false,
      },
      {
        type: "shared",
        pattern: "shared/*",
        capture: ["surface"],
        partialMatch: false,
      },
      { type: "app", pattern: "app", partialMatch: false },
      { type: "server-composition", pattern: "server", partialMatch: false },
      { type: "worker", pattern: "worker", partialMatch: false },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        checkUnknownLocals: true,
        message: "This dependency is outside the approved module and shared-surface direction.",
        policies: [
          {
            from: schemaComposition,
            allow: { to: moduleSchemaEntry },
          },
          {
            from: { element: { types: "app" } },
            allow: {
              to: [
                { element: { types: "app" } },
                { element: { types: "server-composition" } },
                moduleIndex,
                presentationEntry,
                {
                  element: {
                    types: "shared",
                    captured: {
                      surface: [
                        "auth",
                        "design",
                        "health",
                        "http",
                        "logging",
                        "presentation",
                        "time",
                        "validation",
                      ],
                    },
                  },
                },
              ],
            },
          },
          {
            from: { element: { types: "server-composition" } },
            allow: { to: moduleIndex },
          },
          {
            from: { element: { types: "module" } },
            allow: {
              to: [
                {
                  element: {
                    types: "module-layer",
                    captured: {
                      module: sameModule,
                      layer: "application",
                    },
                  },
                },
              ],
            },
          },
          {
            from: { element: { types: "module-layer", captured: { layer: "presentation" } } },
            allow: {
              to: [
                {
                  element: {
                    types: "module-layer",
                    captured: { module: sameModule, layer: "application" },
                  },
                },
                moduleIndex,
                {
                  element: {
                    types: "shared",
                    captured: { surface: ["presentation", "design", "time", "validation"] },
                  },
                },
              ],
            },
          },
          {
            from: { element: { types: "module-layer", captured: { layer: "application" } } },
            allow: {
              to: [
                {
                  element: {
                    types: "module-layer",
                    captured: { module: sameModule, layer: ["domain", "infrastructure"] },
                  },
                },
                moduleIndex,
                {
                  element: {
                    types: "shared",
                    captured: {
                      surface: ["auth", "db", "logging", "http", "time", "validation"],
                    },
                  },
                },
              ],
            },
          },
          {
            from: { element: { types: "module-layer", captured: { layer: "domain" } } },
            allow: { to: { element: { types: "shared", captured: { surface: "time" } } } },
          },
          {
            from: { element: { types: "module-layer", captured: { layer: "infrastructure" } } },
            allow: {
              to: [
                {
                  element: {
                    types: "module-layer",
                    captured: { module: sameModule, layer: "domain" },
                  },
                },
                {
                  element: {
                    types: "shared",
                    captured: {
                      surface: ["auth", "config", "db", "logging", "http", "time", "validation"],
                    },
                  },
                },
              ],
            },
          },
          {
            from: { element: { types: "shared", captured: { surface: "auth" } } },
            allow: {
              to: {
                element: {
                  types: "shared",
                  captured: {
                    surface: ["config", "db", "http", "logging", "time", "validation"],
                  },
                },
              },
            },
          },
          {
            from: { element: { types: "shared", captured: { surface: "db" } } },
            allow: {
              to: [
                {
                  element: { types: "shared", captured: { surface: ["config", "logging"] } },
                },
              ],
            },
          },
          {
            from: { element: { types: "shared", captured: { surface: "health" } } },
            allow: {
              to: {
                element: { types: "shared", captured: { surface: ["config", "db", "logging"] } },
              },
            },
          },
          {
            from: { element: { types: "shared", captured: { surface: "http" } } },
            allow: {
              to: { element: { types: "shared", captured: { surface: "logging" } } },
            },
          },
          {
            from: { element: { types: "shared", captured: { surface: "presentation" } } },
            allow: {
              to: {
                element: { types: "shared", captured: { surface: ["design", "time", "validation"] } },
              },
            },
          },
          {
            from: { element: { types: "worker" } },
            allow: {
              to: [
                { element: { types: "worker" } },
                moduleIndex,
                {
                  element: {
                    types: "shared",
                    captured: { surface: ["config", "logging", "health", "time"] },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  },
});
