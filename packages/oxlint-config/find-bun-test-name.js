import getImportedName from './get-imported-name.js';

export default function findBunTestName(context, identifier) {
  for (let scope = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);

    if (variable !== undefined && variable.defs.length > 0) {
      const [definition] = variable.defs;

      return isBunTestSpecifier(definition.node) ? getImportedName(definition.node) : null;
    }
  }

  // Bun's test runner declares its functions as globals, so a name nothing declares is Bun's
  return identifier.name;
}

function isBunTestSpecifier(node) {
  return (
    node.type === 'ImportSpecifier' &&
    node.importKind !== 'type' &&
    node.parent.source.value === 'bun:test' &&
    node.parent.importKind !== 'type'
  );
}
