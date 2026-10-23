import { basename, relative, sep } from 'node:path';
import resolveRepoRoot from './resolve-repo-root.js';

const runnerNames = new Set(['test', 'it', 'describe']);

const maxTestTimeout = {
  meta: {
    type: 'problem',
    messages: {
      timeout:
        'Keep this timeout of {{timeoutMs}} ms within the 5 s limit, or move the test into a lane: a root `e2e/` suite, or a `*.browser.test.ts`, `*.docker.test.ts` or `*.host.test.ts` file.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          lanes: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const lanes = new Set(['browser', 'docker', 'host', ...(context.options[0]?.lanes ?? [])]);

    if (probeLaneFile(context, lanes)) {
      return {};
    }

    return {
      CallExpression(node) {
        // the inner call of `test.each(rows)(…)` takes the rows, not a timeout
        if (node.parent.type === 'CallExpression' && node.parent.callee === node) {
          return;
        }

        const name = findRunnerName(context, node.callee);

        if (name === 'setDefaultTimeout') {
          emitTimeouts(context, node.arguments.slice(0, 1));
        } else if (name !== null && runnerNames.has(name)) {
          emitTimeouts(context, node.arguments.slice(1));
        }
      },
    };
  },
};

export default maxTestTimeout;

const laneTestPattern = /\.(?<lane>[^.]+)\.test\.tsx?$/u;

// the repo root, not oxlint's working directory, so a per-package lint script
// reads the same root `e2e/` as a run from the root
function probeLaneFile(context, lanes) {
  const filename = context.physicalFilename;
  const lane = laneTestPattern.exec(basename(filename))?.groups?.lane;
  const [first] = relative(resolveRepoRoot(filename) ?? context.cwd, filename).split(sep);

  return first === 'e2e' || (lane !== undefined && lanes.has(lane));
}

function findRunnerName(context, callee) {
  let current = callee;

  while (current.type !== 'Identifier') {
    if (current.type === 'CallExpression') {
      current = current.callee;
    } else if (current.type === 'MemberExpression' && !current.computed) {
      current = current.object;
    } else {
      return null;
    }
  }

  const variable = findVariable(context, current);

  if (variable === null) {
    return current.name;
  }

  const [definition] = variable.defs;

  if (
    variable.defs.length === 1 &&
    definition.type === 'ImportBinding' &&
    definition.node.type === 'ImportSpecifier' &&
    definition.parent.source.value === 'bun:test'
  ) {
    return getImportedName(definition.node);
  }

  return null;
}

// a name with no declaration reads the global that `bun test` defines
function findVariable(context, identifier) {
  for (let scope = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);

    if (variable !== undefined && variable.defs.length > 0) {
      return variable;
    }
  }

  return null;
}

function getImportedName(specifier) {
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

const limitMs = 5000;

function emitTimeouts(context, args) {
  for (const argument of args) {
    const value = argument.type === 'ObjectExpression' ? findTimeoutValue(argument) : argument;
    const timeoutMs = value === undefined ? null : findNumber(context, value, new Set());

    if (timeoutMs !== null && timeoutMs > limitMs) {
      context.report({ node: value, messageId: 'timeout', data: { timeoutMs } });
    }
  }
}

function findTimeoutValue(options) {
  const property = options.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      !candidate.computed &&
      (candidate.key.name ?? candidate.key.value) === 'timeout',
  );

  return property?.value;
}

const arithmetic = {
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '*': (left, right) => left * right,
  '/': (left, right) => left / right,
};

function findNumber(context, node, seen) {
  if (node.type === 'Literal') {
    return typeof node.value === 'number' ? node.value : null;
  }

  if (node.type === 'BinaryExpression' && Object.hasOwn(arithmetic, node.operator)) {
    const left = findNumber(context, node.left, seen);
    const right = findNumber(context, node.right, seen);

    return left === null || right === null ? null : arithmetic[node.operator](left, right);
  }

  if (node.type !== 'Identifier' || seen.has(node.name)) {
    return null;
  }

  const definition = findVariable(context, node)?.defs[0];

  if (
    definition?.type !== 'Variable' ||
    definition.parent.kind !== 'const' ||
    definition.node.id.type !== 'Identifier' ||
    definition.node.init === null
  ) {
    return null;
  }

  return findNumber(context, definition.node.init, new Set([...seen, node.name]));
}
