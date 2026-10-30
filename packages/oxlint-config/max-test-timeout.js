import { basename } from 'node:path';
import buildLaneLimits from './build-lane-limits.js';
import getImportedName from './get-imported-name.js';
import resolveSuiteDirectory from './resolve-suite-directory.js';

const runnerNames = new Set(['test', 'it', 'describe']);

const unitLimitMs = 5000;

export default function buildMaxTestTimeout(resolveRoot, rigLanes) {
  return {
    meta: {
      type: 'problem',
      messages: {
        timeout:
          'This timeout of {{timeoutMs}} ms is above the {{limitMs}} ms limit of the {{lane}} lane. Find its cause in the "Slow tests" section of the testing skill and fix it; a raised timeout only hides the cost.',
        rigLanes:
          'Declare lanes in rig.config.ts only: this repo has one, and the `lanes` option here would give the limits a second source.',
      },
      schema: [
        {
          type: 'object',
          properties: {
            lanes: {
              anyOf: [
                { type: 'array', items: { type: 'string' } },
                { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
              ],
            },
          },
          additionalProperties: false,
        },
      ],
    },
    create(context) {
      const limits = rigLanes ?? buildLaneLimits(context.options[0]?.lanes);

      const filename = context.physicalFilename;
      const lane = resolveLane(resolveRoot(filename) ?? context.cwd, filename, limits);
      const limit = {
        lane: lane ?? 'unit',
        limitMs: lane === null ? unitLimitMs : limits.get(lane),
      };

      return {
        Program() {
          if (rigLanes !== null && context.options[0]?.lanes !== undefined) {
            context.report({
              loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
              messageId: 'rigLanes',
            });
          }
        },
        CallExpression(node) {
          // the inner call of `test.each(rows)(…)` takes the rows, not a timeout
          if (node.parent.type === 'CallExpression' && node.parent.callee === node) {
            return;
          }

          const name = findRunnerName(context, node.callee);

          if (name === 'setDefaultTimeout') {
            emitTimeouts(context, node.arguments.slice(0, 1), limit);
          } else if (name !== null && runnerNames.has(name)) {
            emitTimeouts(context, node.arguments.slice(1), limit);
          }
        },
      };
    },
  };
}

const laneTestPattern = /\.(?<lane>[^.]+)\.test\.tsx?$/u;

// a lane suffix wins over the directory, because the default run leaves a suffixed file out and its
// lane's script runs it; the directory is relative to the repo root, not oxlint's working
// directory, so a per-package lint script reads the same root `e2e/` as a run from the root
function resolveLane(root, filename, limits) {
  const lane = laneTestPattern.exec(basename(filename))?.groups?.lane;

  if (lane !== undefined && limits.has(lane)) {
    return lane;
  }

  return resolveSuiteDirectory(root, filename) === 'e2e' ? 'e2e' : null;
}

function findRunnerName(context, callee) {
  let current = callee;
  let member = null;

  while (current.type !== 'Identifier') {
    if (current.type === 'CallExpression') {
      current = current.callee;
    } else if (current.type === 'MemberExpression' && !current.computed) {
      member = current;
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
    variable.defs.length !== 1 ||
    definition.type !== 'ImportBinding' ||
    definition.parent.source.value !== 'bun:test'
  ) {
    return null;
  }

  if (definition.node.type === 'ImportNamespaceSpecifier') {
    return member?.property.name ?? null;
  }

  return definition.node.type === 'ImportSpecifier' ? getImportedName(definition.node) : null;
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

function emitTimeouts(context, args, limit) {
  for (const argument of args) {
    const value = argument.type === 'ObjectExpression' ? findTimeoutValue(argument) : argument;
    const timeoutMs = value === undefined ? null : findNumber(context, value, new Set());

    if (timeoutMs !== null && timeoutMs > limit.limitMs) {
      context.report({ node: value, messageId: 'timeout', data: { timeoutMs, ...limit } });
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
