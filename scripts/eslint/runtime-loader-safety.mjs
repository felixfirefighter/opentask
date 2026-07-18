import {
  accessesGlobalDescriptor,
  accessesGlobalProperty,
  destructuresGlobalProperty,
  findVariable,
  isDefinitionIdentifier,
  isGlobalObject,
  isNonReferenceKey,
  isOwnPropertyDescriptorGet,
  isReflectGet,
  isUnshadowedGlobal,
  propertyName,
  staticString,
  unwrap,
} from "./ast-analysis.mjs";

function isTypeOnlyFunctionReference(node) {
  return ["TSExpressionWithTypeArguments", "TSQualifiedName", "TSTypeQuery", "TSTypeReference"].includes(
    node.parent.type,
  );
}

function isFunctionExpression(node) {
  return ["ArrowFunctionExpression", "ClassExpression", "FunctionExpression"].includes(node?.type);
}

function resolvesToFunction(node, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (!valueNode) return false;
  if (isFunctionExpression(valueNode)) return true;
  if (valueNode.type === "Identifier") {
    const variable = findVariable(sourceCode, valueNode);
    if (!variable || seen.has(variable)) return false;
    seen.add(variable);
    const definition = variable.defs.find((candidate) =>
      ["ClassName", "FunctionName", "Variable"].includes(candidate.type),
    );
    if (definition?.node.type === "FunctionDeclaration" || definition?.node.type === "ClassDeclaration") {
      return true;
    }
    return definition?.node.type === "VariableDeclarator"
      ? resolvesToFunction(definition.node.init, sourceCode, seen)
      : false;
  }
  return Boolean(
    valueNode.type === "CallExpression" &&
    valueNode.callee.type === "MemberExpression" &&
    propertyName(valueNode.callee, sourceCode) === "getPrototypeOf" &&
    isUnshadowedGlobal(valueNode.callee.object, "Object", sourceCode) &&
    resolvesToFunction(valueNode.arguments[0], sourceCode, seen),
  );
}

function isDynamicFunctionConstructor(node, sourceCode) {
  const valueNode = unwrap(node);
  if (valueNode?.type === "MemberExpression") {
    return (
      propertyName(valueNode, sourceCode) === "constructor" &&
      resolvesToFunction(valueNode.object, sourceCode)
    );
  }
  if (isReflectGet(valueNode, sourceCode)) {
    return (
      staticString(valueNode.arguments[1], sourceCode) === "constructor" &&
      resolvesToFunction(valueNode.arguments[0], sourceCode)
    );
  }
  return Boolean(
    isOwnPropertyDescriptorGet(valueNode, sourceCode) &&
    staticString(valueNode.arguments[1], sourceCode) === "constructor" &&
    resolvesToFunction(valueNode.arguments[0], sourceCode),
  );
}

function isAmbientLoaderReference(node, sourceCode) {
  const variable = findVariable(sourceCode, node);
  return Boolean(
    variable?.defs.some(
      (definition) => definition.node.declare === true || definition.node.parent?.declare === true,
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

export const noRuntimeLoaderEscapesRule = {
  meta: {
    type: "problem",
    docs: { description: "Keep runtime module loading statically auditable." },
    schema: [],
    messages: {
      dynamicCode: "Runtime-generated code bypasses architecture and package safety gates.",
      loader: "Use a static ESM import so architecture and package safety gates can inspect it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const loaderGlobals = ["__non_webpack_require__", "module", "require"];
    const dynamicConstructorGlobals = ["AsyncFunction", "AsyncGeneratorFunction", "GeneratorFunction"];
    const globalObjectLoaders = ["eval", "Function", "module", "require"];
    const processLoaders = ["getBuiltinModule", "mainModule"];

    function inspectAccess(node) {
      if (isDynamicFunctionConstructor(node, sourceCode)) {
        context.report({ node, messageId: "dynamicCode" });
      } else if (
        accessesGlobalDescriptor(
          node,
          "globalThis",
          ["eval", "Function", "module", "process", "require"],
          sourceCode,
        )
      ) {
        context.report({ node, messageId: "dynamicCode" });
      } else if (accessesGlobalDescriptor(node, "process", processLoaders, sourceCode)) {
        context.report({ node, messageId: "loader" });
      } else if (accessesGlobalProperty(node, "globalThis", globalObjectLoaders, sourceCode)) {
        context.report({ node, messageId: "dynamicCode" });
      } else if (accessesGlobalProperty(node, "process", processLoaders, sourceCode)) {
        context.report({ node, messageId: "loader" });
      }
    }

    return {
      Identifier(node) {
        if (isNonReferenceKey(node)) return;
        if (
          (node.name === "__non_webpack_require__" && !isDefinitionIdentifier(node, sourceCode)) ||
          loaderGlobals.some(
            (name) =>
              isUnshadowedGlobal(node, name, sourceCode) ||
              (node.name === name &&
                !isDefinitionIdentifier(node, sourceCode) &&
                isAmbientLoaderReference(node, sourceCode)),
          )
        ) {
          context.report({ node, messageId: "loader" });
        }
        if (isUnshadowedGlobal(node, "eval", sourceCode)) {
          context.report({ node, messageId: "dynamicCode" });
        }
        if (isUnshadowedGlobal(node, "Function", sourceCode) && !isTypeOnlyFunctionReference(node)) {
          context.report({ node, messageId: "dynamicCode" });
        }
        if (
          dynamicConstructorGlobals.some((name) => isUnshadowedGlobal(node, name, sourceCode)) &&
          !isTypeOnlyFunctionReference(node)
        ) {
          context.report({ node, messageId: "dynamicCode" });
        }
      },
      MemberExpression: inspectAccess,
      CallExpression(node) {
        if (copiesRuntimeGlobals(node, sourceCode)) {
          context.report({ node, messageId: "loader" });
        } else if (isReflectGet(node, sourceCode) || isOwnPropertyDescriptorGet(node, sourceCode)) {
          inspectAccess(node);
        }
      },
      SpreadElement(node) {
        if (
          isGlobalObject(node.argument, "globalThis", sourceCode) ||
          isGlobalObject(node.argument, "process", sourceCode)
        ) {
          context.report({ node, messageId: "loader" });
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
          destructuresGlobalProperty(node, "globalThis", globalObjectLoaders, sourceCode)
        ) {
          context.report({ node, messageId: "dynamicCode" });
        } else if (destructuresGlobalProperty(node, "process", processLoaders, sourceCode)) {
          context.report({ node, messageId: "loader" });
        }
      },
    };
  },
};
