import findFunctionName from './find-function-name.js';
import isVerbMatch from './is-verb-match.js';

// banned verb → the role-table verb to use instead; null means the verb is
// too vague to map and the name should say what the function does
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

// the role table's template prefixes (`with<X>`, `handle<Event>`, …): each is
// only valid with a suffix, and a bare `handle` is the vague banned verb
const suffixRequiredVerbs = new Set(['to', 'with', 'make', 'use', 'on']);

function findBannedVerb(name) {
  for (const [verb, replacement] of bannedVerbs) {
    if (isVerbMatch(name, verb)) {
      return { verb, replacement };
    }
  }

  return name === 'handle' ? { verb: 'handle', replacement: null } : null;
}

function planReport(name, exemptNames) {
  if (exemptNames.has(name) || !/^[a-z]/u.test(name)) {
    return null;
  }

  if (suffixRequiredVerbs.has(name)) {
    return { messageId: 'bareTemplate', data: { name } };
  }

  const banned = findBannedVerb(name);

  if (banned === null) {
    return null;
  }

  if (banned.replacement === null) {
    return { messageId: 'vagueVerb', data: { name, verb: banned.verb } };
  }

  return {
    messageId: 'bannedVerb',
    data: { name, verb: banned.verb, replacement: banned.replacement },
  };
}

const functionVerb = {
  meta: {
    type: 'suggestion',
    messages: {
      bannedVerb: "'{{name}}' starts with the banned verb '{{verb}}' — use `{{replacement}}`.",
      vagueVerb: "'{{name}}' starts with the banned verb '{{verb}}' — name what the function does.",
      bareTemplate: "'{{name}}' is a bare prefix — add what it applies to, as in `{{name}}Thing`.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptNames: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const exemptNames = new Set(context.options[0]?.exemptNames);

    const checkFunction = (node) => {
      const id = findFunctionName(node);
      const report = id === null ? null : planReport(id.name, exemptNames);

      if (report !== null) {
        context.report({ node: id, messageId: report.messageId, data: report.data });
      }
    };

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};

export default functionVerb;
