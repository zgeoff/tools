// a declaration's own name, the variable or key a function is assigned to,
// or else a function expression's own name; getters, setters, computed and
// quoted keys name nothing
export default function findFunctionName(node) {
  if (node.type === 'FunctionDeclaration') {
    return node.id;
  }

  const parent = node.parent;

  if (parent.type === 'VariableDeclarator') {
    return parent.init === node && parent.id.type === 'Identifier' ? parent.id : null;
  }

  if (parent.type === 'MethodDefinition') {
    return parent.kind === 'method' ? findKeyName(parent) : null;
  }

  if (parent.type === 'Property' && parent.parent.type === 'ObjectExpression') {
    return parent.kind === 'init' && parent.value === node ? findKeyName(parent) : null;
  }

  return node.id ?? null;
}

function findKeyName(member) {
  return !member.computed && member.key.type === 'Identifier' ? member.key : null;
}
