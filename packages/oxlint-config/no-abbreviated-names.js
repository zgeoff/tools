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

    // a computed key names its property as a plain key does when it is a
    // string written in place, as in `{ ['src']: 1 }`; a computed identifier
    // reads a variable, whose declaration is checked where it is made
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

    // a write to a member names that property, whether the member stands
    // alone or sits inside a destructuring target
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

    // function-verb checks only a plain function or method name, so a quoted
    // method, a signature or a declared function would pass both rules
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

      // a signature without a body names its parameters as an implementation does
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

      // a class, an enum and a namespace are values at run time; a quoted
      // module name is a path, not a value name
      'ClassDeclaration, ClassExpression, TSEnumDeclaration'(node) {
        checkName(node.id);
      },
      TSModuleDeclaration(node) {
        if (node.id.type === 'Identifier') {
          checkName(node.id);
        }
      },

      // an import's local binding is a value name in this module, whatever the
      // exporting module calls it; a type-only import names a type, not a value
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

      // an export alias is the name every importing module reads the value by
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

// the name a key or binding spells out in the source: an identifier, a
// string, or a template with no substitutions; a key built at run time has
// no static name, so the result is null
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

function isTypeOnlyImport(specifier) {
  return specifier.importKind === 'type' || specifier.parent.importKind === 'type';
}

function isTypeOnlyExport(specifier) {
  return specifier.exportKind === 'type' || specifier.parent.exportKind === 'type';
}

// the members an assignment target writes; a bare identifier in the target
// writes a variable declared elsewhere, and its declaration is checked there
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
