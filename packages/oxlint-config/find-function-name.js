// a declaration's own name, the variable a function is assigned to, or the
// key of a class method, an object-literal method or a function-valued
// property; getters, setters, computed and quoted keys name nothing
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

  return null;
}

function findKeyName(member) {
  return !member.computed && member.key.type === 'Identifier' ? member.key : null;
}
