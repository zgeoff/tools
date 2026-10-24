// a plain lint run has no types to tell Kysely's `sql` or bun:sqlite's
// `query` from another library's of the same name, so the rule matches by name
const castMethods = new Set(['$castTo', '$narrowType', '$assertType']);
const rowMethods = new Set(['query', 'prepare']);
const configMethods = new Set([
  'getObject',
  'requireObject',
  'getSecretObject',
  'requireSecretObject',
]);

const noHiddenCast = {
  meta: {
    type: 'problem',
    messages: {
      sqlType:
        'A type argument on `sql` claims a result type that the database never checks. Drop it, read the result as `unknown`, and parse it with zod or narrow it with a guard.',
      castMethod:
        '`{{method}}()` claims a type that Kysely never checks. Declare the type in the table types, or narrow the result with a guard.',
      rowType:
        'A type argument on `{{method}}()` claims a row type that the database never checks. Query through Kysely over declared table types, or parse each row with zod.',
      configType:
        'A type argument on `{{method}}()` claims a config shape that Pulumi never checks. Drop it and parse the value with zod.',
    },
    schema: [],
  },
  create(context) {
    return {
      TaggedTemplateExpression(node) {
        if (node.typeArguments && findName(node.tag) === 'sql') {
          context.report({ node, messageId: 'sqlType' });
        }
      },
      CallExpression(node) {
        const method = node.callee.type === 'MemberExpression' ? findName(node.callee) : null;

        if (method === null) {
          return;
        }

        if (castMethods.has(method)) {
          context.report({ node, messageId: 'castMethod', data: { method } });
        } else if (node.typeArguments && rowMethods.has(method)) {
          context.report({ node, messageId: 'rowType', data: { method } });
        } else if (node.typeArguments && configMethods.has(method)) {
          context.report({ node, messageId: 'configType', data: { method } });
        }
      },
    };
  },
};

function findName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type !== 'MemberExpression') {
    return null;
  }

  if (!node.computed) {
    return node.property.name;
  }

  return typeof node.property.value === 'string' ? node.property.value : null;
}

export default noHiddenCast;
