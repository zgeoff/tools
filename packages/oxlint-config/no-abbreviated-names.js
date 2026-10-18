// each `names` key is a short name and its value the text that replaces it;
// the rule matches a whole name, so `timeoutMs` passes when `ms` is listed
const noAbbreviatedNames = {
  meta: {
    type: 'suggestion',
    messages: {
      abbreviated:
        'Rename `{{name}}` to {{replacement}}: name a value for what it holds, in full words.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          names: { type: 'object', additionalProperties: { type: 'string', minLength: 1 } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const names = new Map(Object.entries(context.options[0]?.names ?? {}));

    if (names.size === 0) {
      return {};
    }

    const checkName = (node) => {
      const isName = node?.type === 'Identifier' || node?.type === 'PrivateIdentifier';

      if (!isName || !names.has(node.name)) {
        return;
      }

      const prefix = node.type === 'PrivateIdentifier' ? '#' : '';

      context.report({
        node,
        messageId: 'abbreviated',
        data: { name: `${prefix}${node.name}`, replacement: names.get(node.name) },
      });
    };

    const checkPattern = (node) => {
      for (const identifier of collectPatternIdentifiers(node)) {
        checkName(identifier);
      }
    };

    const checkKey = (node) => {
      if (!node.computed) {
        checkName(node.key);
      }
    };

    const checkParams = (node) => {
      for (const param of node.params) {
        checkPattern(param);
      }
    };

    return {
      VariableDeclarator(node) {
        checkPattern(node.id);
      },
      FunctionDeclaration: checkParams,
      FunctionExpression: checkParams,
      ArrowFunctionExpression: checkParams,

      // a signature without a body names its parameters as an implementation does
      TSDeclareFunction: checkParams,
      TSEmptyBodyFunctionExpression: checkParams,
      TSFunctionType: checkParams,
      TSConstructorType: checkParams,
      TSMethodSignature: checkParams,
      TSCallSignatureDeclaration: checkParams,
      TSConstructSignatureDeclaration: checkParams,
      CatchClause(node) {
        checkPattern(node.param);
      },
      'ObjectExpression > Property': checkKey,
      PropertyDefinition: checkKey,
      AccessorProperty: checkKey,
      TSAbstractPropertyDefinition: checkKey,
      TSAbstractAccessorProperty: checkKey,
      TSPropertySignature: checkKey,

      // a getter or setter is read and written as a property, so its key is a
      // value name
      "MethodDefinition[kind='get']": checkKey,
      "MethodDefinition[kind='set']": checkKey,
      "TSAbstractMethodDefinition[kind='get']": checkKey,
      "TSAbstractMethodDefinition[kind='set']": checkKey,
      "TSMethodSignature[kind='get']": checkKey,
      "TSMethodSignature[kind='set']": checkKey,

      // an import's local binding is a value name in this module, whatever the
      // exporting module calls it; a type-only import names a type, not a value
      'ImportSpecifier, ImportDefaultSpecifier, ImportNamespaceSpecifier'(node) {
        if (!isTypeOnlyImport(node)) {
          checkName(node.local);
        }
      },
      'AssignmentExpression > MemberExpression.left'(node) {
        if (!node.computed) {
          checkName(node.property);
        }
      },
    };
  },
};

function isTypeOnlyImport(specifier) {
  return specifier.importKind === 'type' || specifier.parent.importKind === 'type';
}

// the names a binding pattern declares: a destructured key's alias, not the
// key, since the key belongs to the object being read
function collectPatternIdentifiers(node) {
  if (node === null || node === undefined) {
    return [];
  }

  if (node.type === 'Identifier') {
    return [node];
  }

  if (node.type === 'ObjectPattern') {
    return node.properties.flatMap((property) => {
      const binding = property.type === 'RestElement' ? property : property.value;

      return collectPatternIdentifiers(binding);
    });
  }

  if (node.type === 'ArrayPattern') {
    return node.elements.flatMap((element) => collectPatternIdentifiers(element));
  }

  if (node.type === 'AssignmentPattern') {
    return collectPatternIdentifiers(node.left);
  }

  if (node.type === 'RestElement') {
    return collectPatternIdentifiers(node.argument);
  }

  if (node.type === 'TSParameterProperty') {
    return collectPatternIdentifiers(node.parameter);
  }

  return [];
}

export default noAbbreviatedNames;
