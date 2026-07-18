import { noPrivateRuntimeReexportsRule } from "./export-safety.mjs";

const restrictedPackagesRule = {
  meta: {
    type: "problem",
    docs: { description: "Reject restricted package imports in every JavaScript import form." },
    schema: [
      {
        type: "object",
        properties: {
          packages: { type: "array", items: { type: "string" }, uniqueItems: true },
        },
        required: ["packages"],
        additionalProperties: false,
      },
    ],
    messages: {
      restricted: 'Import "{{source}}" through its approved repository-owned boundary.',
    },
  },
  create(context) {
    const packages = context.options[0]?.packages ?? [];

    function inspect(node, sourceNode) {
      const source = sourceNode?.value;
      if (typeof source !== "string") return;
      if (packages.some((packageName) => source === packageName || source.startsWith(`${packageName}/`))) {
        context.report({ node, messageId: "restricted", data: { source } });
      }
    }

    return {
      ImportDeclaration(node) {
        inspect(node, node.source);
      },
      ExportNamedDeclaration(node) {
        inspect(node, node.source);
      },
      ExportAllDeclaration(node) {
        inspect(node, node.source);
      },
      ImportExpression(node) {
        inspect(node, node.source);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          inspect(node, node.arguments[0]);
        }
      },
    };
  },
};

const literalDynamicImportsRule = {
  meta: {
    type: "problem",
    docs: { description: "Require statically auditable dynamic import sources." },
    schema: [],
    messages: { computed: "Dynamic import sources must be string literals." },
  },
  create(context) {
    return {
      ImportExpression(node) {
        if (typeof node.source.value !== "string") {
          context.report({ node, messageId: "computed" });
        }
      },
    };
  },
};

const explicitTypeImportsRule = {
  meta: {
    type: "problem",
    docs: { description: "Require explicit import type declarations so boundaries remain auditable." },
    schema: [],
    messages: { implicit: 'Use an explicit "import type" declaration instead of a TypeScript import type.' },
  },
  create(context) {
    return {
      TSImportType(node) {
        context.report({ node, messageId: "implicit" });
      },
    };
  },
};

const directNodeModulesRule = {
  meta: {
    type: "problem",
    docs: { description: "Reject direct filesystem imports that bypass package restrictions." },
    schema: [],
    messages: { direct: "Import packages by name; direct node_modules paths bypass safety gates." },
  },
  create(context) {
    function inspect(node, sourceNode) {
      const source = sourceNode?.value;
      if (typeof source === "string" && /(^|[\\/])node_modules([\\/]|$)/u.test(source)) {
        context.report({ node, messageId: "direct" });
      }
    }

    return {
      ImportDeclaration(node) {
        inspect(node, node.source);
      },
      ExportNamedDeclaration(node) {
        inspect(node, node.source);
      },
      ExportAllDeclaration(node) {
        inspect(node, node.source);
      },
      ImportExpression(node) {
        inspect(node, node.source);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          inspect(node, node.arguments[0]);
        }
      },
    };
  },
};

export const importSafety = {
  rules: {
    "direct-node-modules": directNodeModulesRule,
    "explicit-type-imports": explicitTypeImportsRule,
    "literal-dynamic-imports": literalDynamicImportsRule,
    "no-alternate-loaders": restrictedPackagesRule,
    "no-data-packages": restrictedPackagesRule,
    "no-framework-packages": restrictedPackagesRule,
    "no-private-runtime-reexports": noPrivateRuntimeReexportsRule,
    "no-raw-pino": restrictedPackagesRule,
  },
};
