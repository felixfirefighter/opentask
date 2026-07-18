import { findVariable, isReflectGet, propertyName, staticString, unwrap } from "./ast-analysis.mjs";

const filesystemSources = ["fs", "node:fs", "node:fs/promises"];
const outputPaths = [
  "/dev/fd/1",
  "/dev/fd/2",
  "/dev/stderr",
  "/dev/stdout",
  "/proc/self/fd/1",
  "/proc/self/fd/2",
];

function importSource(definition) {
  const declaration = definition?.node?.parent;
  return declaration?.type === "ImportDeclaration" ? declaration.source.value : undefined;
}

function isFsNamespace(node, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (
    valueNode?.type === "MemberExpression" &&
    propertyName(valueNode, sourceCode) === "promises" &&
    isFsNamespace(valueNode.object, sourceCode, seen)
  ) {
    return true;
  }
  if (valueNode?.type !== "Identifier") return false;
  const variable = findVariable(sourceCode, valueNode);
  if (!variable || seen.has(variable)) return false;
  seen.add(variable);
  const importDefinition = variable.defs.find((candidate) => candidate.type === "ImportBinding");
  if (importDefinition && filesystemSources.includes(importSource(importDefinition))) {
    if (["ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(importDefinition.node.type)) {
      return true;
    }
    if (
      importDefinition.node.type === "ImportSpecifier" &&
      (importDefinition.node.imported.name ?? importDefinition.node.imported.value) === "promises"
    ) {
      return true;
    }
  }
  const initializer = variable.defs
    .filter((candidate) => candidate.type === "Variable")
    .map((candidate) => candidate.node)
    .find(
      (declaration) => declaration.type === "VariableDeclarator" && declaration.id.type === "Identifier",
    )?.init;
  return initializer ? isFsNamespace(initializer, sourceCode, seen) : false;
}

function isFsWriter(node, names, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (!valueNode) return false;
  if (valueNode.type === "MemberExpression") {
    return names.includes(propertyName(valueNode, sourceCode)) && isFsNamespace(valueNode.object, sourceCode);
  }
  if (isReflectGet(valueNode, sourceCode)) {
    return (
      names.includes(staticString(valueNode.arguments[1], sourceCode)) &&
      isFsNamespace(valueNode.arguments[0], sourceCode)
    );
  }
  if (valueNode.type !== "Identifier") return false;
  const variable = findVariable(sourceCode, valueNode);
  if (!variable || seen.has(variable)) return false;
  seen.add(variable);
  const importDefinition = variable.defs.find((candidate) => candidate.type === "ImportBinding");
  if (
    importDefinition?.node.type === "ImportSpecifier" &&
    filesystemSources.includes(importSource(importDefinition)) &&
    names.includes(importDefinition.node.imported.name ?? importDefinition.node.imported.value)
  ) {
    return true;
  }
  for (const definition of variable.defs.filter((candidate) => candidate.type === "Variable")) {
    if (definition.node.type !== "VariableDeclarator") continue;
    if (definition.node.id.type === "Identifier" && definition.node.init) {
      if (isFsWriter(definition.node.init, names, sourceCode, seen)) return true;
    } else if (
      definition.node.id.type === "ObjectPattern" &&
      isFsNamespace(definition.node.init, sourceCode)
    ) {
      const matches = definition.node.id.properties.some(
        (property) =>
          property.type === "Property" &&
          property.value.type === "Identifier" &&
          property.value.name === valueNode.name &&
          names.includes(
            property.computed
              ? staticString(property.key, sourceCode)
              : property.key.type === "Identifier"
                ? property.key.name
                : property.key.value,
          ),
      );
      if (matches) return true;
    }
  }
  return false;
}

function optionValue(node, name, sourceCode) {
  const valueNode = unwrap(node);
  if (valueNode?.type !== "ObjectExpression") return undefined;
  const property = valueNode.properties.find(
    (candidate) =>
      candidate.type === "Property" &&
      (candidate.computed
        ? staticString(candidate.key, sourceCode)
        : candidate.key.type === "Identifier"
          ? candidate.key.name
          : candidate.key.value) === name,
  );
  return property?.type === "Property" ? property.value : undefined;
}

export function isFilesystemOutputCall(node, sourceCode, isOutputDescriptor) {
  const firstArgument = node.arguments[0];
  const isDescriptorWriter =
    isFsWriter(node.callee, ["write", "writeSync", "writev", "writevSync"], sourceCode) &&
    isOutputDescriptor(firstArgument);
  const isFileWriter =
    isFsWriter(node.callee, ["appendFile", "appendFileSync", "writeFile", "writeFileSync"], sourceCode) &&
    (isOutputDescriptor(firstArgument) || outputPaths.includes(staticString(firstArgument, sourceCode)));
  const opensOutput =
    isFsWriter(node.callee, ["createWriteStream", "open", "openSync"], sourceCode) &&
    outputPaths.includes(staticString(firstArgument, sourceCode));
  const opensOutputDescriptor =
    isFsWriter(node.callee, ["createWriteStream"], sourceCode) &&
    isOutputDescriptor(optionValue(node.arguments[1], "fd", sourceCode));

  return isDescriptorWriter || isFileWriter || opensOutput || opensOutputDescriptor;
}
