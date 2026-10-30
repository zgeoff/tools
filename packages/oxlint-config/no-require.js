import getImportedName from './get-imported-name.js';

const moduleSources = new Set(['node:module', 'module']);

const noRequire = {
  meta: {
    type: 'problem',
    messages: {
      createRequire:
        'Use `import`, never `createRequire`: a require function loads modules that the import rules cannot see.',
      require:
        'Use `import`, never `require`: a require function loads modules that the import rules cannot see.',
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type' || !moduleSources.has(node.source.value)) {
          return;
        }

        for (const variable of context.sourceCode.getDeclaredVariables(node)) {
          emitCreateRequireReads(context, variable);
        }
      },
      'Program:exit'(program) {
        for (const reference of collectRequireReferences(context, program)) {
          context.report({ node: reference.identifier, messageId: 'require' });
        }
      },
    };
  },
};

export default noRequire;

function emitCreateRequireReads(context, variable) {
  const [definition] = variable.defs;

  if (definition.node.type === 'ImportSpecifier') {
    if (
      definition.node.importKind !== 'type' &&
      getImportedName(definition.node) === 'createRequire'
    ) {
      context.report({ node: definition.node, messageId: 'createRequire' });
    }

    return;
  }

  // a default import of node:module is the same object as its namespace
  for (const reference of variable.references) {
    const node = findCreateRequireRead(reference.identifier);

    if (node !== null) {
      context.report({ node, messageId: 'createRequire' });
    }
  }
}

function findCreateRequireRead(object) {
  const parent = object.parent;

  if (parent.type === 'MemberExpression' && parent.object === object) {
    return isCreateRequireKey(parent.property, parent.computed) ? parent : null;
  }

  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === object &&
    parent.id.type === 'ObjectPattern'
  ) {
    return (
      parent.id.properties.find(
        (property) =>
          property.type === 'Property' && isCreateRequireKey(property.key, property.computed),
      ) ?? null
    );
  }

  return null;
}

function isCreateRequireKey(key, isComputed) {
  return (
    (key.type === 'Literal' && key.value === 'createRequire') ||
    (!isComputed && key.type === 'Identifier' && key.name === 'createRequire')
  );
}

// `env.node` declares `require` as a global, so a read resolves to that variable; without it,
// the read stays unresolved and passes through the global scope
function collectRequireReferences(context, program) {
  const scope = context.sourceCode.getScope(program);
  const declared = scope.set.get('require');
  const declaredReferences = declared?.defs.length === 0 ? declared.references : [];
  const unresolved = scope.through.filter((reference) => reference.identifier.name === 'require');

  return [...new Set([...declaredReferences, ...unresolved])];
}
