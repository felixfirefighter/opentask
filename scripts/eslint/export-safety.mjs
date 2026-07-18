import { findVariable, isNonReferenceKey, isUnshadowedGlobal, unwrap } from "./ast-analysis.mjs";

function isPrivateRuntimeSource(source) {
  if (typeof source !== "string") return false;
  if (["drizzle-orm", "pg", "pg-boss"].some((name) => source === name || source.startsWith(`${name}/`))) {
    return true;
  }

  const normalized = source.replaceAll("\\", "/");
  return (
    normalized === "@/shared/db" ||
    normalized.startsWith("@/shared/db/") ||
    /(^|\/)shared\/db(\/|$)/u.test(normalized) ||
    /(^|\/)infrastructure(\/|$)/u.test(normalized)
  );
}

export const noPrivateRuntimeReexportsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Keep database and infrastructure values behind application service exports.",
    },
    schema: [],
    messages: {
      privateRuntime:
        "Application exports must expose an application-owned contract, not re-export database or infrastructure code.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const privateVariables = new Set();
    const functionBoundaries = new Set([
      "ArrowFunctionExpression",
      "ClassExpression",
      "FunctionDeclaration",
      "FunctionExpression",
    ]);

    function containsPrivateBinding(node) {
      const valueNode = unwrap(node);
      if (!valueNode) return false;
      if (valueNode.type === "Identifier") {
        return !isNonReferenceKey(valueNode) && privateVariables.has(findVariable(sourceCode, valueNode));
      }
      if (
        ["BinaryExpression", "TemplateLiteral", "UnaryExpression", "UpdateExpression"].includes(
          valueNode.type,
        )
      ) {
        return false;
      }
      if (
        valueNode.type === "CallExpression" &&
        isUnshadowedGlobal(valueNode.callee, "Boolean", sourceCode)
      ) {
        return false;
      }
      if (functionBoundaries.has(valueNode.type)) return false;

      return (sourceCode.visitorKeys[valueNode.type] ?? []).some((key) => {
        const child = valueNode[key];
        return Array.isArray(child)
          ? child.some((candidate) => containsPrivateBinding(candidate))
          : containsPrivateBinding(child);
      });
    }

    function directlyReturnsPrivateValue(node) {
      if (!node) return false;
      if (node.type === "ArrowFunctionExpression" && node.expression) {
        return containsPrivateBinding(node.body);
      }
      if (!node.body || node.body.type !== "BlockStatement") return false;

      function inspectStatement(statement) {
        if (!statement) return false;
        if (statement.type === "ReturnStatement") return containsPrivateBinding(statement.argument);
        if (functionBoundaries.has(statement.type)) return false;
        return (sourceCode.visitorKeys[statement.type] ?? []).some((key) => {
          const child = statement[key];
          return Array.isArray(child)
            ? child.some((candidate) => inspectStatement(candidate))
            : child
              ? inspectStatement(child)
              : false;
        });
      }

      return node.body.body.some((statement) => inspectStatement(statement));
    }

    function recordPattern(pattern) {
      if (pattern.type === "Identifier") {
        const variable = findVariable(sourceCode, pattern);
        if (variable) privateVariables.add(variable);
      } else if (pattern.type === "AssignmentPattern") {
        recordPattern(pattern.left);
      } else if (pattern.type === "RestElement") {
        recordPattern(pattern.argument);
      } else if (pattern.type === "ArrayPattern") {
        for (const element of pattern.elements) if (element) recordPattern(element);
      } else if (pattern.type === "ObjectPattern") {
        for (const property of pattern.properties) {
          recordPattern(property.type === "Property" ? property.value : property.argument);
        }
      }
    }

    function report(node) {
      context.report({ node, messageId: "privateRuntime" });
    }

    return {
      ImportDeclaration(node) {
        if (!isPrivateRuntimeSource(node.source.value)) return;
        for (const variable of sourceCode.getDeclaredVariables(node)) privateVariables.add(variable);
      },
      ExportAllDeclaration(node) {
        if (isPrivateRuntimeSource(node.source.value)) report(node);
      },
      ExportDefaultDeclaration(node) {
        if (containsPrivateBinding(node.declaration) || directlyReturnsPrivateValue(node.declaration)) {
          report(node);
        }
      },
      ExportNamedDeclaration(node) {
        if (isPrivateRuntimeSource(node.source?.value)) {
          report(node);
          return;
        }
        if (
          node.declaration?.type === "VariableDeclaration" &&
          node.declaration.declarations.some(
            (declaration) =>
              containsPrivateBinding(declaration.init) || directlyReturnsPrivateValue(declaration.init),
          )
        ) {
          report(node);
          return;
        }
        if (
          node.declaration?.type === "FunctionDeclaration" &&
          directlyReturnsPrivateValue(node.declaration)
        ) {
          report(node);
          return;
        }
        if (
          node.specifiers.some(
            (specifier) =>
              specifier.local.type === "Identifier" &&
              privateVariables.has(findVariable(sourceCode, specifier.local)),
          )
        ) {
          report(node);
        }
      },
      TSExportAssignment(node) {
        if (containsPrivateBinding(node.expression)) report(node);
      },
      VariableDeclarator(node) {
        if (containsPrivateBinding(node.init) || directlyReturnsPrivateValue(node.init)) {
          recordPattern(node.id);
        }
      },
      AssignmentExpression(node) {
        if (containsPrivateBinding(node.right)) recordPattern(node.left);
      },
      FunctionDeclaration(node) {
        if (node.id && directlyReturnsPrivateValue(node)) recordPattern(node.id);
      },
    };
  },
};
