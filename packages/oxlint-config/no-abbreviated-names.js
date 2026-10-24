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
      const name = findStaticName(node);

      if (name === null || !names.has(name)) {
        return;
      }

      const prefix = node.type === 'PrivateIdentifier' ? '#' : '';

      context.report({
        node,
        messageId: 'abbreviated',
        data: { name: `${prefix}${name}`, replacement: names.get(name) },
      });
    };

    const checkPattern = (node) => {
      for (const identifier of collectPatternIdentifiers(node)) {
        checkName(identifier);
      }
    };

    const checkMemberName = (node, name) => {
      if (!node.computed || name.type !== 'Identifier') {
        checkName(name);
      }
    };

    const checkKey = (node) => {
      checkMemberName(node, node.key);
    };

    const checkParams = (node) => {
      for (const param of node.params) {
        checkPattern(param);
      }
    };

    const checkAssignmentTarget = (node) => {
      for (const member of collectTargetMembers(node)) {
        checkMemberName(member, member.property);
      }
    };

    const checkLoopTarget = (node) => {
      if (node.left.type !== 'VariableDeclaration') {
        checkAssignmentTarget(node.left);
      }
    };

    const checkFunction = (node) => {
      checkName(node.id);
      checkParams(node);
    };

    return {
      VariableDeclarator(node) {
        checkPattern(node.id);
      },
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkParams,

      TSDeclareFunction: checkFunction,
      TSEmptyBodyFunctionExpression: checkParams,
      TSFunctionType: checkParams,
      TSConstructorType: checkParams,
      TSMethodSignature(node) {
        checkKey(node);
        checkParams(node);
      },
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
      MethodDefinition: checkKey,
      TSAbstractMethodDefinition: checkKey,

      'ClassDeclaration, ClassExpression, TSEnumDeclaration'(node) {
        checkName(node.id);
      },
      TSModuleDeclaration(node) {
        // `declare module 'name'` quotes a module path, not a value name
        if (node.id.type === 'Identifier') {
          checkName(node.id);
        }
      },

      'ImportSpecifier, ImportDefaultSpecifier, ImportNamespaceSpecifier'(node) {
        if (!isTypeOnlyImport(node)) {
          checkName(node.local);
        }
      },
      TSImportEqualsDeclaration(node) {
        if (node.importKind !== 'type') {
          checkName(node.id);
        }
      },
      TSIndexSignature(node) {
        for (const parameter of node.parameters) {
          checkName(parameter);
        }
      },
      TSEnumMember(node) {
        checkName(node.id);
      },

      ExportSpecifier(node) {
        if (!isTypeOnlyExport(node)) {
          checkName(node.exported);
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') {
          checkName(node.exported);
        }
      },
      AssignmentExpression(node) {
        checkAssignmentTarget(node.left);
      },
      ForInStatement: checkLoopTarget,
      ForOfStatement: checkLoopTarget,
    };
  },
};

function findStaticName(node) {
  if (node?.type === 'Identifier' || node?.type === 'PrivateIdentifier') {
    return node.name;
  }

  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? null;
  }

  return null;
}

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

function collectTargetMembers(node) {
  if (node === null || node === undefined) {
    return [];
  }

  if (node.type === 'MemberExpression') {
    return [node];
  }

  if (node.type === 'ObjectPattern') {
    return node.properties.flatMap((property) => {
      const target = property.type === 'RestElement' ? property : property.value;

      return collectTargetMembers(target);
    });
  }

  if (node.type === 'ArrayPattern') {
    return node.elements.flatMap((element) => collectTargetMembers(element));
  }

  if (node.type === 'AssignmentPattern') {
    return collectTargetMembers(node.left);
  }

  if (node.type === 'RestElement') {
    return collectTargetMembers(node.argument);
  }

  return [];
}

function isTypeOnlyImport(specifier) {
  return specifier.importKind === 'type' || specifier.parent.importKind === 'type';
}

function isTypeOnlyExport(specifier) {
  return specifier.exportKind === 'type' || specifier.parent.exportKind === 'type';
}

export default noAbbreviatedNames;
