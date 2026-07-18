export function unwrap(node) {
  if (
    [
      "ChainExpression",
      "TSAsExpression",
      "TSInstantiationExpression",
      "TSNonNullExpression",
      "TSSatisfiesExpression",
    ].includes(node?.type)
  ) {
    return unwrap(node.expression);
  }
  if (node?.type === "SequenceExpression") return unwrap(node.expressions.at(-1));
  return node;
}

export function findVariable(sourceCode, node) {
  if (node.type !== "Identifier") return undefined;
  for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(node.name);
    if (variable) return variable;
  }
  return undefined;
}

export function isDefinitionIdentifier(node, sourceCode) {
  return findVariable(sourceCode, node)?.identifiers.includes(node) ?? false;
}

export function isUnshadowedGlobal(node, name, sourceCode) {
  if (node.type !== "Identifier" || node.name !== name) return false;
  const variable = findVariable(sourceCode, node);
  return sourceCode.isGlobalReference(node) || !variable || variable.defs.length === 0;
}

export function isNonReferenceKey(node) {
  const parent = node.parent;
  if (
    ["BreakStatement", "ContinueStatement", "LabeledStatement"].includes(parent.type) &&
    parent.label === node
  ) {
    return true;
  }
  if (parent.type === "MemberExpression") {
    return parent.property === node && !parent.computed;
  }
  if (parent.type === "ImportSpecifier") return parent.imported === node;
  if (parent.type === "ExportSpecifier") {
    return parent.exported === node || Boolean(parent.parent.source);
  }
  if (!("key" in parent) || parent.key !== node || parent.computed) return false;
  return parent.type !== "Property" || !parent.shorthand;
}

function variableInitializer(sourceCode, node, seen) {
  const variable = findVariable(sourceCode, node);
  if (!variable || seen.has(variable)) return undefined;
  seen.add(variable);
  const definition = variable.defs.find(
    (candidate) =>
      candidate.type === "Variable" &&
      candidate.node.type === "VariableDeclarator" &&
      candidate.node.id.type === "Identifier",
  );
  return definition?.node.init;
}

export function staticString(node, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (!valueNode) return undefined;
  if (valueNode.type === "Literal" && typeof valueNode.value === "string") return valueNode.value;
  if (valueNode.type === "TemplateLiteral" && valueNode.expressions.length === 0) {
    return valueNode.quasis[0]?.value.cooked;
  }
  if (valueNode.type === "BinaryExpression" && valueNode.operator === "+") {
    const left = staticString(valueNode.left, sourceCode, seen);
    const right = staticString(valueNode.right, sourceCode, seen);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (valueNode.type === "Identifier") {
    return staticString(variableInitializer(sourceCode, valueNode, seen), sourceCode, seen);
  }
  return undefined;
}

export function staticNumber(node, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (!valueNode) return undefined;
  if (valueNode.type === "Literal" && typeof valueNode.value === "number") return valueNode.value;
  if (valueNode.type === "Identifier") {
    return staticNumber(variableInitializer(sourceCode, valueNode, seen), sourceCode, seen);
  }
  return undefined;
}

export function propertyName(node, sourceCode) {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  return staticString(node.property, sourceCode);
}

export function isGlobalObject(node, name, sourceCode, seen = new Set()) {
  const valueNode = unwrap(node);
  if (!valueNode) return false;
  if (valueNode.type === "Identifier") {
    const acceptedNames = name === "globalThis" ? ["global", "globalThis", "self", "window"] : [name];
    if (acceptedNames.some((candidate) => isUnshadowedGlobal(valueNode, candidate, sourceCode))) {
      return true;
    }
    const initializer = variableInitializer(sourceCode, valueNode, seen);
    return initializer ? isGlobalObject(initializer, name, sourceCode, seen) : false;
  }
  if (valueNode.type === "MemberExpression") {
    return (
      propertyName(valueNode, sourceCode) === name &&
      (isGlobalObject(valueNode.object, "globalThis", sourceCode, seen) ||
        isGlobalObject(valueNode.object, "global", sourceCode, seen))
    );
  }
  if (isReflectGet(valueNode, sourceCode)) {
    return (
      staticString(valueNode.arguments[1], sourceCode) === name &&
      isGlobalObject(valueNode.arguments[0], "globalThis", sourceCode, seen)
    );
  }
  return false;
}

export function isReflectGet(node, sourceCode) {
  const valueNode = unwrap(node);
  return Boolean(
    valueNode?.type === "CallExpression" &&
    valueNode.arguments.length >= 2 &&
    valueNode.callee.type === "MemberExpression" &&
    propertyName(valueNode.callee, sourceCode) === "get" &&
    isGlobalObject(valueNode.callee.object, "Reflect", sourceCode),
  );
}

export function isOwnPropertyDescriptorGet(node, sourceCode) {
  const valueNode = unwrap(node);
  return Boolean(
    valueNode?.type === "CallExpression" &&
    valueNode.arguments.length >= 2 &&
    valueNode.callee.type === "MemberExpression" &&
    propertyName(valueNode.callee, sourceCode) === "getOwnPropertyDescriptor" &&
    (isGlobalObject(valueNode.callee.object, "Object", sourceCode) ||
      isGlobalObject(valueNode.callee.object, "Reflect", sourceCode)),
  );
}

export function accessesGlobalDescriptor(node, objectName, names, sourceCode) {
  const valueNode = unwrap(node);
  return Boolean(
    isOwnPropertyDescriptorGet(valueNode, sourceCode) &&
    names.includes(staticString(valueNode.arguments[1], sourceCode)) &&
    isGlobalObject(valueNode.arguments[0], objectName, sourceCode),
  );
}

export function accessesGlobalProperty(node, objectName, names, sourceCode) {
  const valueNode = unwrap(node);
  if (valueNode?.type === "MemberExpression") {
    return (
      names.includes(propertyName(valueNode, sourceCode)) &&
      isGlobalObject(valueNode.object, objectName, sourceCode)
    );
  }
  return Boolean(
    isReflectGet(valueNode, sourceCode) &&
    names.includes(staticString(valueNode.arguments[1], sourceCode)) &&
    isGlobalObject(valueNode.arguments[0], objectName, sourceCode),
  );
}

export function destructuresGlobalProperty(node, objectName, names, sourceCode) {
  if (node.id.type !== "ObjectPattern" || !isGlobalObject(node.init, objectName, sourceCode)) return false;
  return node.id.properties.some(
    (property) =>
      property.type === "Property" &&
      names.includes(
        property.computed
          ? staticString(property.key, sourceCode)
          : property.key.type === "Identifier"
            ? property.key.name
            : property.key.value,
      ),
  );
}
