export default function findVariable(context, identifier) {
  for (let scope = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);

    if (variable !== undefined && variable.defs.length > 0) {
      return variable;
    }
  }

  return null;
}
