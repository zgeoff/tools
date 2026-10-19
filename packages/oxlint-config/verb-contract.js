import findFunctionName from './find-function-name.js';
import isVerbMatch from './is-verb-match.js';

// each named function is a frame; I/O inside an unnamed callback counts
// against the nearest named function around it, since that name makes the
// promise, while a return counts only for the function it returns from
const verbContract = {
  meta: {
    type: 'problem',
    messages: {
      pureVerbIO:
        "'{{name}}' starts with '{{verb}}', which promises no I/O, but it {{reason}} — move the I/O out, or rename it with a verb that may do I/O, such as `read` or `probe`.",
      predicateNotBoolean:
        "'{{name}}' starts with '{{verb}}', which promises a boolean, but it declares another return type.",
      booleanWithoutPredicate:
        "'{{name}}' returns a boolean and does no I/O — start its name with `is`, `has`, `can` or `should`.",
      findCannotMiss:
        "'{{name}}' starts with 'find', which promises it can miss, but its return type holds no null or undefined — name it `get` if it cannot miss.",
      getCanMiss:
        "'{{name}}' starts with 'get', which promises it cannot miss, but it can return null or undefined — name it `find`.",
    },
    schema: [],
  },
  create(context) {
    const frames = [];

    const findNamedFrame = () => frames.findLast((frame) => frame.name !== null) ?? null;

    const markIO = (reason) => {
      const frame = findNamedFrame();

      if (frame !== null && frame.ioReason === null) {
        frame.ioReason = reason;
      }
    };

    const markReturn = (argument) => {
      const frame = frames.at(-1);

      if (frame !== undefined && argument !== null && isNullishLiteral(argument)) {
        frame.returnsNullish = true;
      }
    };

    const enterFunction = (node) => {
      const name = findFunctionName(node);

      frames.push({ node, name, ioReason: null, returnsNullish: false });

      // an unnamed async callback counts only through what it awaits
      if (node.async && name !== null) {
        markIO('is async');
      }

      if (node.type === 'ArrowFunctionExpression' && node.expression) {
        markReturn(node.body);
      }
    };

    const exitFunction = () => {
      const frame = frames.pop();

      if (frame.name !== null) {
        checkFrame(context, frame);
      }
    };

    return {
      FunctionDeclaration: enterFunction,
      FunctionExpression: enterFunction,
      ArrowFunctionExpression: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      'FunctionExpression:exit': exitFunction,
      'ArrowFunctionExpression:exit': exitFunction,
      ReturnStatement(node) {
        markReturn(node.argument);
      },
      AwaitExpression() {
        markIO('awaits');
      },
      ForOfStatement(node) {
        if (node.await) {
          markIO('awaits');
        }
      },
      CallExpression(node) {
        const frame = findNamedFrame();
        const reason = frame === null ? null : findCallIO(context, node, frame.node);

        if (reason !== null) {
          markIO(reason);
        }
      },
      TaggedTemplateExpression(node) {
        if (findRootName(node.tag) === '$') {
          markIO('runs a `$` shell command');
        }
      },
      MemberExpression(node) {
        if (isEnvRead(context, node)) {
          markIO('reads the environment');
        }
      },
    };
  },
};

export default verbContract;

// the role table's verbs that promise no I/O
const pureVerbs = [
  'is',
  'has',
  'can',
  'should',
  'build',
  'parse',
  'format',
  'render',
  'pick',
  'find',
  'get',
  'collect',
  'to',
];

const predicateVerbs = ['is', 'has', 'can', 'should', 'probe'];

// the role table's verbs that may do I/O, and common free verbs that name a
// change to the world; a call to a function named with one is I/O
const effectfulVerbs = [
  'probe',
  'read',
  'write',
  'run',
  'create',
  'remove',
  'load',
  'update',
  'send',
  'start',
  'stop',
  'wait',
  'set',
  'apply',
  'record',
  'claim',
  'open',
  'close',
  'spawn',
  'print',
  'emit',
  'release',
  'register',
  'upsert',
  'insert',
  'refresh',
  'restart',
];

// a function returning a success flag, such as `removeFile` or `tryLock`,
// rightly returns a boolean without a predicate verb
const flagVerbs = [...effectfulVerbs, 'try'];

function checkFrame(context, frame) {
  const name = frame.name.name;
  const returnType = frame.node.returnType?.typeAnnotation ?? null;
  const resultType = returnType === null ? null : unwrapPromise(returnType);
  const pureVerb = findVerb(name, pureVerbs);
  const predicateVerb = findVerb(name, predicateVerbs);
  const report = (messageId, data) =>
    context.report({ node: frame.name, messageId, data: { name, ...data } });

  if (pureVerb !== null && frame.ioReason !== null) {
    report('pureVerbIO', { verb: pureVerb, reason: frame.ioReason });
  }

  if (predicateVerb !== null && resultType !== null && !isBooleanType(resultType)) {
    report('predicateNotBoolean', { verb: predicateVerb });
  }

  const isUnnamedFlag =
    predicateVerb === null &&
    frame.ioReason === null &&
    returnType !== null &&
    isBooleanType(returnType) &&
    findVerb(name, flagVerbs) === null;

  if (isUnnamedFlag) {
    report('booleanWithoutPredicate', {});
  }

  if (pureVerb === 'find' && resultType !== null && !canHoldNullish(resultType)) {
    report('findCannotMiss', {});
  }

  const declaresMiss = resultType !== null && canBeNullish(resultType);

  if (pureVerb === 'get' && (frame.returnsNullish === true || declaresMiss)) {
    report('getCanMiss', {});
  }
}

function findVerb(name, verbs) {
  return verbs.find((verb) => isVerbMatch(name, verb, true)) ?? null;
}

function unwrapPromise(type) {
  const typeArguments = type.typeArguments ?? type.typeParameters;

  if (
    type.type === 'TSTypeReference' &&
    type.typeName.type === 'Identifier' &&
    type.typeName.name === 'Promise' &&
    typeArguments?.params.length === 1
  ) {
    const [resolved] = typeArguments.params;

    return resolved;
  }

  return type;
}

function isBooleanType(type) {
  return (
    type.type === 'TSBooleanKeyword' ||
    (type.type === 'TSTypePredicate' && !type.asserts) ||
    (type.type === 'TSLiteralType' && typeof type.literal.value === 'boolean')
  );
}

// a declared null or undefined is a miss path; an open type such as `unknown`
// may hold one, so it lets `find` miss but never makes `get` miss
function canBeNullish(type) {
  return hasMemberType(type, ['TSNullKeyword', 'TSUndefinedKeyword']);
}

function canHoldNullish(type) {
  return hasMemberType(type, [
    'TSNullKeyword',
    'TSUndefinedKeyword',
    'TSVoidKeyword',
    'TSAnyKeyword',
    'TSUnknownKeyword',
  ]);
}

function hasMemberType(type, types) {
  if (type.type === 'TSUnionType') {
    return type.types.some((member) => hasMemberType(member, types));
  }

  return types.includes(type.type);
}

function isNullishLiteral(node) {
  return (
    (node.type === 'Literal' && node.raw === 'null') ||
    (node.type === 'Identifier' && node.name === 'undefined')
  );
}

const kyselyRunMethods = new Set(['execute', 'executeTakeFirst', 'executeTakeFirstOrThrow']);
const bunIOMembers = new Set(['spawn', 'spawnSync', 'file', 'write', '$']);

function findCallIO(context, node, frameNode) {
  const callee = node.callee;
  const rootName = findRootName(callee);
  const memberName = callee.type === 'MemberExpression' ? findMemberName(callee) : null;

  if (rootName === '$') {
    return 'runs a `$` shell command';
  }

  if (isGlobalName(context, callee, 'fetch')) {
    return 'calls `fetch`';
  }

  if (memberName !== null && kyselyRunMethods.has(memberName)) {
    return 'runs a database query';
  }

  if (isGlobalName(context, callee.object, 'Bun') && bunIOMembers.has(memberName)) {
    return `calls \`Bun.${memberName}\``;
  }

  const binding = rootName === null ? null : findBinding(context, node, rootName);
  const source = binding === null ? null : findImportSource(binding);

  if (source !== null && isIOImport(source, binding, memberName)) {
    return `calls \`${rootName}\` from \`${source}\``;
  }

  if (!isOwnCallee({ rootName, binding, source, memberName }, frameNode)) {
    return null;
  }

  const calleeName = callee.type === 'Identifier' ? callee.name : memberName;
  const verb = calleeName === null ? null : findVerb(calleeName, effectfulVerbs);

  // a bare method name such as `map.set` or `fn.apply` is a built-in that a
  // name cannot tell from I/O
  if (verb === null || memberName === verb) {
    return null;
  }

  return `calls '${calleeName}', whose verb may do I/O`;
}

function findMemberName(member) {
  return !member.computed && member.property.type === 'Identifier' ? member.property.name : null;
}

function findRootName(node) {
  let current = node;

  while (current.type === 'MemberExpression' || current.type === 'CallExpression') {
    current = current.type === 'MemberExpression' ? current.object : current.callee;
  }

  if (current.type === 'ThisExpression') {
    return 'this';
  }

  return current.type === 'Identifier' ? current.name : null;
}

// the global itself, so a local binding of the same name passes
function isGlobalName(context, node, name) {
  return (
    node !== undefined &&
    node.type === 'Identifier' &&
    node.name === name &&
    findBinding(context, node, name) === null
  );
}

function findBinding(context, node, name) {
  let scope = context.sourceCode.getScope(node);

  while (scope !== null) {
    const variable = scope.set.get(name);

    if (variable !== undefined && variable.defs.length > 0) {
      return variable;
    }

    scope = scope.upper;
  }

  return null;
}

function findImportSource(variable) {
  const [definition] = variable.defs;

  return definition.type === 'ImportBinding' ? definition.parent.source.value : null;
}

const ioModules = new Set(['fs', 'fs/promises', 'child_process']);

function isIOImport(source, binding, memberName) {
  if (ioModules.has(source.replace(/^node:/u, ''))) {
    return true;
  }

  if (source !== 'bun') {
    return false;
  }

  const specifier = binding.defs[0].node;
  const imported = specifier.type === 'ImportSpecifier' ? specifier.imported.name : memberName;

  return bunIOMembers.has(imported);
}

// a callee declared in the file or imported by a relative or aliased path; a
// package keeps its own naming, and a method on a value the function makes
// itself, such as `date.setUTCDate`, changes only that value
function isOwnCallee(callee, frameNode) {
  if (callee.rootName === 'this') {
    return true;
  }

  if (callee.binding === null) {
    return false;
  }

  if (callee.source !== null) {
    return ['.', '/', '#', '~/', '@/'].some((prefix) => callee.source.startsWith(prefix));
  }

  return callee.memberName === null || !isLocalVariable(callee.binding, frameNode);
}

function isLocalVariable(binding, frameNode) {
  const [definition] = binding.defs;
  const [start, end] = frameNode.range;

  return (
    definition.type === 'Variable' &&
    definition.name.range[0] >= start &&
    definition.name.range[1] <= end
  );
}

function isEnvRead(context, node) {
  return (
    findMemberName(node) === 'env' &&
    (isGlobalName(context, node.object, 'process') || isGlobalName(context, node.object, 'Bun'))
  );
}
