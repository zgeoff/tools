import { basename } from 'node:path';
import findFunctionName from './find-function-name.js';

const testFilePattern = /\.test\.tsx?$/u;

const timerPromiseModules = new Set(['node:timers/promises', 'timers/promises']);

const noTestSleep = {
  meta: {
    type: 'problem',
    messages: {
      sleep:
        'Wait on a condition, never a fixed delay: poll it inside a wait helper named `waitFor…` or `waitUntil…`, or wait on the event that signals it.',
    },
    schema: [],
  },
  create(context) {
    if (!testFilePattern.test(basename(context.physicalFilename))) {
      return {};
    }

    return {
      "MemberExpression[computed=false][object.name='Bun'][property.name=/^sleep(Sync)?$/]"(node) {
        emitSleep(context, node);
      },
      ImportDeclaration(node) {
        if (timerPromiseModules.has(node.source.value)) {
          for (const variable of context.sourceCode.getDeclaredVariables(node)) {
            emitTimerPromiseReads(context, variable);
          }
        }
      },
      CallExpression(node) {
        if (isWrappedTimeout(node)) {
          emitSleep(context, node);
        }
      },
    };
  },
};

export default noTestSleep;

function emitSleep(context, node) {
  if (!isInWaitHelper(node)) {
    context.report({ node, messageId: 'sleep' });
  }
}

const waitHelperPattern = /^wait(?:For|Until)(?![a-z])/u;

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isInWaitHelper(node) {
  for (
    let current = node.parent;
    current !== null && current !== undefined;
    current = current.parent
  ) {
    if (
      functionTypes.has(current.type) &&
      waitHelperPattern.test(findFunctionName(current)?.name ?? '')
    ) {
      return true;
    }
  }

  return false;
}

function emitTimerPromiseReads(context, variable) {
  const [definition] = variable.defs;
  const isNamespace = definition.node.type === 'ImportNamespaceSpecifier';

  if (!isNamespace && findImportedName(definition.node) !== 'setTimeout') {
    return;
  }

  for (const reference of variable.references) {
    const node = isNamespace ? reference.identifier.parent : reference.identifier;

    if (
      !isNamespace ||
      (node.type === 'MemberExpression' && !node.computed && node.property.name === 'setTimeout')
    ) {
      emitSleep(context, node);
    }
  }
}

function findImportedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') {
    return null;
  }

  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

function isWrappedTimeout(call) {
  const callee = call.callee;
  const isTimeout =
    (callee.type === 'Identifier' && callee.name === 'setTimeout') ||
    (callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'globalThis' &&
      callee.property.name === 'setTimeout');

  if (!isTimeout) {
    return false;
  }

  let child = call;

  for (let node = call.parent; node !== null && node !== undefined; node = node.parent) {
    if (
      node.type === 'NewExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'Promise'
    ) {
      return node.arguments.includes(child);
    }

    child = node;
  }

  return false;
}
