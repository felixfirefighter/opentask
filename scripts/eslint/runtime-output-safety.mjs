import {
  accessesGlobalDescriptor,
  accessesGlobalProperty,
  destructuresGlobalProperty,
  findVariable,
  isGlobalObject,
  isNonReferenceKey,
  isOwnPropertyDescriptorGet,
  isReflectGet,
  isUnshadowedGlobal,
  propertyName,
  staticNumber,
  staticString,
  unwrap,
} from "./ast-analysis.mjs";
import { isFilesystemOutputCall } from "./runtime-filesystem-output.mjs";

function isProcessStream(node, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (!valueNode) return false;
  if (
    valueNode.type === "MemberExpression" &&
    ["stderr", "stdout"].includes(propertyName(valueNode, sourceCode)) &&
    isGlobalObject(valueNode.object, "process", sourceCode)
  ) {
    return true;
  }
  if (
    isReflectGet(valueNode, sourceCode) &&
    ["stderr", "stdout"].includes(staticString(valueNode.arguments[1], sourceCode)) &&
    isGlobalObject(valueNode.arguments[0], "process", sourceCode)
  ) {
    return true;
  }
  if (valueNode.type !== "Identifier") return false;
  const variable = findVariable(sourceCode, valueNode);
  if (!variable || seen.has(variable)) return false;
  seen.add(variable);
  const definition = variable.defs.find((candidate) => candidate.type === "Variable");
  if (definition?.node.type !== "VariableDeclarator") return false;
  if (definition.node.id.type === "Identifier") {
    return isProcessStream(definition.node.init, sourceCode, seen);
  }
  if (
    definition.node.id.type !== "ObjectPattern" ||
    !isGlobalObject(definition.node.init, "process", sourceCode)
  ) {
    return false;
  }
  return definition.node.id.properties.some(
    (property) =>
      property.type === "Property" &&
      property.value.type === "Identifier" &&
      property.value.name === valueNode.name &&
      ["stderr", "stdout"].includes(
        property.computed
          ? staticString(property.key, sourceCode)
          : property.key.type === "Identifier"
            ? property.key.name
            : property.key.value,
      ),
  );
}

function isProcessStreamDescriptor(node, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (!valueNode) return false;
  if (
    valueNode.type === "MemberExpression" &&
    propertyName(valueNode, sourceCode) === "fd" &&
    isProcessStream(valueNode.object, sourceCode)
  ) {
    return true;
  }
  if (valueNode.type !== "Identifier") return false;
  const variable = findVariable(sourceCode, valueNode);
  if (!variable || seen.has(variable)) return false;
  seen.add(variable);
  const definition = variable.defs.find((candidate) => candidate.type === "Variable");
  if (definition?.node.type !== "VariableDeclarator") return false;
  if (definition.node.id.type === "Identifier") {
    return isProcessStreamDescriptor(definition.node.init, sourceCode, seen);
  }
  return Boolean(
    definition.node.id.type === "ObjectPattern" &&
    isProcessStream(definition.node.init, sourceCode) &&
    definition.node.id.properties.some(
      (property) =>
        property.type === "Property" &&
        property.value.type === "Identifier" &&
        property.value.name === valueNode.name &&
        (property.computed
          ? staticString(property.key, sourceCode)
          : property.key.type === "Identifier"
            ? property.key.name
            : property.key.value) === "fd",
    ),
  );
}

function copiesRuntimeGlobals(node, sourceCode) {
  const valueNode = unwrap(node);
  return Boolean(
    valueNode?.type === "CallExpression" &&
    valueNode.callee.type === "MemberExpression" &&
    propertyName(valueNode.callee, sourceCode) === "assign" &&
    isUnshadowedGlobal(valueNode.callee.object, "Object", sourceCode) &&
    valueNode.arguments
      .slice(1)
      .some(
        (argument) =>
          isGlobalObject(argument, "globalThis", sourceCode) ||
          isGlobalObject(argument, "process", sourceCode),
      ),
  );
}

export const noUnreviewedOutputRule = {
  meta: {
    type: "problem",
    docs: { description: "Keep runtime output behind the reviewed structured logger." },
    schema: [],
    messages: { output: "Emit runtime output through shared/logging instead of an unreviewed channel." },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const streamWriters = ["_write", "_writev", "end", "write"];
    function isOutputDescriptor(node) {
      return [1, 2].includes(staticNumber(node, sourceCode)) || isProcessStreamDescriptor(node, sourceCode);
    }

    function inspectAccess(node) {
      if (
        accessesGlobalProperty(node, "globalThis", ["console"], sourceCode) ||
        accessesGlobalProperty(node, "process", ["_rawDebug", "emitWarning"], sourceCode) ||
        accessesGlobalDescriptor(node, "globalThis", ["console"], sourceCode) ||
        accessesGlobalDescriptor(
          node,
          "process",
          ["_rawDebug", "emitWarning", "stderr", "stdout"],
          sourceCode,
        ) ||
        (isOwnPropertyDescriptorGet(node, sourceCode) &&
          streamWriters.includes(staticString(node.arguments[1], sourceCode)) &&
          isProcessStream(node.arguments[0], sourceCode)) ||
        (node.type === "MemberExpression" &&
          streamWriters.includes(propertyName(node, sourceCode)) &&
          isProcessStream(node.object, sourceCode)) ||
        (isReflectGet(node, sourceCode) &&
          streamWriters.includes(staticString(node.arguments[1], sourceCode)) &&
          isProcessStream(node.arguments[0], sourceCode))
      ) {
        context.report({ node, messageId: "output" });
      }
    }

    return {
      Identifier(node) {
        if (isNonReferenceKey(node)) return;
        if (isUnshadowedGlobal(node, "console", sourceCode)) {
          context.report({ node, messageId: "output" });
        }
      },
      ImportDeclaration(node) {
        if (["console", "node:console"].includes(node.source.value)) {
          context.report({ node, messageId: "output" });
        }
      },
      ExportAllDeclaration(node) {
        if (["console", "node:console"].includes(node.source.value)) {
          context.report({ node, messageId: "output" });
        }
      },
      ExportNamedDeclaration(node) {
        if (["console", "node:console"].includes(node.source?.value)) {
          context.report({ node, messageId: "output" });
        }
      },
      ImportExpression(node) {
        if (["console", "node:console"].includes(staticString(node.source, sourceCode))) {
          context.report({ node, messageId: "output" });
        }
      },
      MemberExpression: inspectAccess,
      CallExpression(node) {
        if (copiesRuntimeGlobals(node, sourceCode)) {
          context.report({ node, messageId: "output" });
        } else if (isReflectGet(node, sourceCode) || isOwnPropertyDescriptorGet(node, sourceCode)) {
          inspectAccess(node);
        }
        if (isFilesystemOutputCall(node, sourceCode, isOutputDescriptor)) {
          context.report({ node, messageId: "output" });
        }
      },
      SpreadElement(node) {
        if (
          isGlobalObject(node.argument, "globalThis", sourceCode) ||
          isGlobalObject(node.argument, "process", sourceCode)
        ) {
          context.report({ node, messageId: "output" });
        }
      },
      VariableDeclarator(node) {
        const hasRuntimeRest =
          node.id.type === "ObjectPattern" &&
          node.id.properties.some((property) => property.type === "RestElement") &&
          (isGlobalObject(node.init, "globalThis", sourceCode) ||
            isGlobalObject(node.init, "process", sourceCode));
        if (
          hasRuntimeRest ||
          destructuresGlobalProperty(node, "globalThis", ["console"], sourceCode) ||
          destructuresGlobalProperty(node, "process", ["_rawDebug", "emitWarning"], sourceCode) ||
          (node.id.type === "ObjectPattern" &&
            isProcessStream(node.init, sourceCode) &&
            node.id.properties.some(
              (property) =>
                property.type === "Property" &&
                streamWriters.includes(
                  property.computed
                    ? staticString(property.key, sourceCode)
                    : property.key.type === "Identifier"
                      ? property.key.name
                      : property.key.value,
                ),
            ))
        ) {
          context.report({ node, messageId: "output" });
        }
      },
    };
  },
};
