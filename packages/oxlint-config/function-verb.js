// the closed verb list from the shared function-naming taxonomy, one entry
// per table row; extending it here without the matching taxonomy edit fails
// the drift-guard test
const taxonomyVerbs = [
  'is',
  'has',
  'can',
  'should',
  'needs',
  'build',
  'define',
  'parse',
  'encode',
  'decode',
  'derive',
  'plan',
  'pick',
  'find',
  'get',
  'collect',
  'count',
  'split',
  'merge',
  'sort',
  'format',
  'render',
  'normalize',
  'resolve',
  'expand',
  'compress',
  'decompress',
  'to',
  'transform',
  'apply',
  'create',
  'claim',
  'read',
  'load',
  'write',
  'remove',
  'update',
  'upsert',
  'set',
  'toggle',
  'reset',
  'print',
  'run',
  'check',
  'try',
  'register',
  'subscribe',
  'unsubscribe',
  'assert',
  'require',
  'verify',
  'emit',
  'send',
  'wait',
  'setup',
  'teardown',
  'start',
  'stop',
  'drain',
  'with',
  'make',
  'use',
  'on',
  'handle',
];

// the templated taxonomy entries (`with<X>`, `handle<Event>`, …): the verb is
// only valid with a suffix, so the bare word is not a function name
const suffixRequiredVerbs = new Set([
  'build',
  'define',
  'to',
  'toggle',
  'try',
  'with',
  'make',
  'use',
  'on',
  'handle',
]);

// banned verb → the taxonomy verb to use instead; null means the verb is too
// vague to map and the name should say what the function does
const bannedVerbs = new Map([
  ['process', null],
  ['manage', null],
  ['do', null],
  ['perform', null],
  ['execute', 'run'],
  ['compute', 'build'],
  ['fetch', 'read'],
  ['save', 'write'],
  ['store', 'write'],
  ['delete', 'remove'],
  ['search', 'find'],
  ['lookup', 'find'],
]);

function isVerbMatch(name, verb, bareAllowed) {
  if (name === verb) {
    return bareAllowed;
  }

  // a digit also ends the verb: acronyms like 2FA start camelCase segments
  return name.startsWith(verb) && /[A-Z0-9]/u.test(name.charAt(verb.length));
}

function findAllowedVerb(name, verbs) {
  return verbs.find((verb) => isVerbMatch(name, verb, !suffixRequiredVerbs.has(verb))) ?? null;
}

function findBannedVerb(name) {
  for (const [verb, replacement] of bannedVerbs) {
    if (isVerbMatch(name, verb, true)) {
      return { verb, replacement };
    }
  }

  return null;
}

function planReport(name, verbs, exemptNames) {
  if (exemptNames.has(name) || !/^[a-z]/u.test(name)) {
    return null;
  }

  if (findAllowedVerb(name, verbs) !== null) {
    return null;
  }

  const banned = findBannedVerb(name);

  if (banned === null) {
    return { messageId: 'unknownVerb', data: { name } };
  }

  if (banned.replacement === null) {
    return { messageId: 'vagueVerb', data: { name, verb: banned.verb } };
  }

  return {
    messageId: 'bannedVerb',
    data: { name, verb: banned.verb, replacement: banned.replacement },
  };
}

/**
 * Enforces the function-naming taxonomy on function declarations,
 * function-valued variables, and class methods. Object-literal properties are
 * exempt — they overwhelmingly implement externally-defined shapes (rule
 * visitors, route tables) whose names the author doesn't choose — as are
 * names not starting with a lowercase letter (components, classes).
 * Options: `verbs` appends repo-local verbs to the shipped taxonomy;
 * `exemptNames` skips exact names.
 */
const functionVerb = {
  meta: {
    type: 'suggestion',
    messages: {
      unknownVerb:
        "'{{name}}' does not start with a taxonomy verb — pick one, or extend the taxonomy and the `verbs` option in the same PR.",
      bannedVerb: "'{{name}}' starts with the banned verb '{{verb}}' — use `{{replacement}}`.",
      vagueVerb: "'{{name}}' starts with the banned verb '{{verb}}' — name what the function does.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          verbs: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          exemptNames: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] ?? {};
    const verbs =
      options.verbs === undefined ? taxonomyVerbs : [...taxonomyVerbs, ...options.verbs];
    const exemptNames = new Set(options.exemptNames);

    const checkName = (id) => {
      const report = planReport(id.name, verbs, exemptNames);

      if (report !== null) {
        context.report({ node: id, messageId: report.messageId, data: report.data });
      }
    };

    return {
      FunctionDeclaration(node) {
        if (node.id !== null) {
          checkName(node.id);
        }
      },
      VariableDeclarator(node) {
        const isFunctionInit =
          node.init !== null &&
          node.init !== undefined &&
          (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression');

        if (isFunctionInit && node.id.type === 'Identifier') {
          checkName(node.id);
        }
      },
      MethodDefinition(node) {
        if (node.kind === 'method' && !node.computed && node.key.type === 'Identifier') {
          checkName(node.key);
        }
      },
    };
  },
};

export default functionVerb;
