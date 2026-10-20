import collectTypeKinds from './collect-type-kinds.js';
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

    // a bare `return` returns undefined as `return undefined` does
    const markReturn = (argument) => {
      const frame = frames.at(-1);

      if (frame !== undefined && (argument === null || isNullishLiteral(argument))) {
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
        if (isShellTarget(resolveCallTarget(context, node, node.tag))) {
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

function isNullishLiteral(node) {
  return (
    (node.type === 'Literal' && node.raw === 'null') ||
    (node.type === 'Identifier' && node.name === 'undefined')
  );
}

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
// rightly returns a boolean without a predicate verb, and a framework prefix
// such as a React hook's `use` wins over the predicate verbs
const flagVerbs = [...effectfulVerbs, 'try', 'use', 'on', 'handle'];

function checkFrame(context, frame) {
  const name = frame.name.name;
  const returnType = frame.node.returnType?.typeAnnotation ?? null;
  const pureVerb = findVerb(name, pureVerbs);
  const predicateVerb = findVerb(name, predicateVerbs);
  const report = (messageId, data) =>
    context.report({ node: frame.name, messageId, data: { name, ...data } });

  if (pureVerb !== null && frame.ioReason !== null) {
    report('pureVerbIO', { verb: pureVerb, reason: frame.ioReason });
  }

  const localTypes = collectLocalTypes(context.sourceCode.ast);
  const declared = returnType === null ? null : collectTypeKinds(returnType, localTypes);
  const resolved = returnType === null ? null : collectTypeKinds(returnType, localTypes, true);

  if (predicateVerb !== null && resolved !== null && !isBooleanOrOpen(resolved)) {
    report('predicateNotBoolean', { verb: predicateVerb });
  }

  const isUnnamedFlag =
    predicateVerb === null &&
    frame.ioReason === null &&
    declared !== null &&
    declared.every((kind) => kind === 'boolean') &&
    findVerb(name, flagVerbs) === null;

  if (isUnnamedFlag) {
    report('booleanWithoutPredicate', {});
  }

  const missKinds = new Set(['nullish', 'void', 'open']);

  if (pureVerb === 'find' && resolved !== null && !resolved.some((kind) => missKinds.has(kind))) {
    report('findCannotMiss', {});
  }

  const declaresMiss = resolved !== null && resolved.includes('nullish');

  if (pureVerb === 'get' && (frame.returnsNullish === true || declaresMiss)) {
    report('getCanMiss', {});
  }
}

function findVerb(name, verbs) {
  return verbs.find((verb) => isVerbMatch(name, verb)) ?? null;
}

const localTypesByProgram = new WeakMap();

function collectLocalTypes(program) {
  const cached = localTypesByProgram.get(program);

  if (cached !== undefined) {
    return cached;
  }

  const localTypes = { aliases: new Map(), interfaces: new Set() };

  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

    if (
      declaration?.type === 'TSTypeAliasDeclaration' &&
      (declaration.typeParameters ?? null) === null
    ) {
      localTypes.aliases.set(declaration.id.name, declaration.typeAnnotation);
    }

    if (declaration?.type === 'TSInterfaceDeclaration') {
      localTypes.interfaces.add(declaration.id.name);
    }
  }

  localTypesByProgram.set(program, localTypes);

  return localTypes;
}

function isBooleanOrOpen(kinds) {
  return kinds.every((kind) => kind === 'boolean' || kind === 'open');
}

const kyselyRunMethods = new Set(['execute', 'executeTakeFirst', 'executeTakeFirstOrThrow']);
const bunIOMembers = new Set(['spawn', 'spawnSync', 'file', 'write', '$']);

function findCallIO(context, node, frameNode) {
  const callee = node.callee;
  const rootName = findRootName(callee);
  const memberName = callee.type === 'MemberExpression' ? findMemberName(callee) : null;
  const binding = rootName === null ? null : findBinding(context, node, rootName);
  const target = resolveCallTarget(context, node, callee);
  const targetSource = findImportSource(target.binding);

  if (isShellTarget(target)) {
    return 'runs a `$` shell command';
  }

  if (target.rootName === 'fetch' && target.binding === null && target.memberName === null) {
    return 'calls `fetch`';
  }

  if (memberName !== null && kyselyRunMethods.has(memberName)) {
    return 'runs a database query';
  }

  if (isBunGlobal(target) && bunIOMembers.has(target.memberName)) {
    return `calls \`Bun.${target.memberName}\``;
  }

  if (targetSource !== null && isIOImport(targetSource, target)) {
    return `calls \`${rootName}\` from \`${targetSource}\``;
  }

  const isOwn =
    isOwnCallee({ rootName, binding, source: findImportSource(binding), memberName }, frameNode) &&
    isOwnCallee({ ...target, source: targetSource }, frameNode);

  if (!isOwn) {
    return null;
  }

  // a bare method name such as `map.set` or `fn.apply` is a built-in that a
  // name cannot tell from I/O, whether the call names it or an alias holds it
  const names = [
    {
      name: callee.type === 'Identifier' ? callee.name : memberName,
      isMethod: memberName !== null,
    },
    buildCalledName(context, node, callee),
  ];

  const effectful = names.find((entry) => {
    const verb = entry.name === null ? null : findVerb(entry.name, effectfulVerbs);

    return verb !== null && !(entry.isMethod && entry.name === verb);
  });

  return effectful === undefined ? null : `calls '${effectful.name}', whose verb may do I/O`;
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

function findMemberName(member) {
  return !member.computed && member.property.type === 'Identifier' ? member.property.name : null;
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

// the source a call reaches: its root binding and the member taken straight
// off the root, as `spawn` in `Bun.spawn(...)`, followed through each local
// alias such as `const read = fs.readFileSync` or `const { spawn } = Bun`
function resolveCallTarget(context, node, callee) {
  const rootName = findRootName(callee);
  let current = {
    rootName,
    binding: rootName === null ? null : findBinding(context, node, rootName),
    memberName: findRootMemberName(callee),
  };

  for (let depth = 0; depth < 8; depth++) {
    const declarator = findAliasDeclarator(current.binding);

    if (declarator === null) {
      return current;
    }

    const init = declarator.init;
    const initRoot = findRootName(init);

    current = {
      rootName: initRoot,
      binding: initRoot === null ? null : findBinding(context, init, initRoot),
      memberName:
        findRootMemberName(init) ??
        findPatternKey(declarator.id, current.rootName) ??
        current.memberName,
    };
  }

  return current;
}

// the member read straight off a chain's root: `$` in `bun.$.cwd('a')`
function findRootMemberName(node) {
  let current = node;
  let memberName = null;

  while (current.type === 'MemberExpression' || current.type === 'CallExpression') {
    if (current.type === 'MemberExpression') {
      memberName = findMemberName(current);
      current = current.object;
    } else {
      current = current.callee;
    }
  }

  return memberName;
}

function findAliasDeclarator(binding) {
  const definition = binding?.defs[0];
  const declarator = definition?.type === 'Variable' ? definition.node : null;
  const init = declarator?.init ?? null;

  return init !== null && (init.type === 'Identifier' || init.type === 'MemberExpression')
    ? declarator
    : null;
}

// the key a destructured binding takes, as `spawn` in `const { spawn: run } = Bun`
function findPatternKey(pattern, name) {
  if (pattern.type !== 'ObjectPattern') {
    return null;
  }

  const property = pattern.properties.find(
    (entry) =>
      entry.type === 'Property' && entry.value.type === 'Identifier' && entry.value.name === name,
  );

  return property === undefined ? null : findKeyName(property);
}

function findKeyName(property) {
  return !property.computed && property.key.type === 'Identifier' ? property.key.name : null;
}

function findImportSource(variable) {
  if (variable === null) {
    return null;
  }

  const [definition] = variable.defs;

  return definition.type === 'ImportBinding' ? definition.parent.source.value : null;
}

// Bun's shell: the `$` export of `bun` under any import form or alias, or
// `Bun.$`; a parameter or local named `$` is some other function
function isShellTarget(target) {
  if (isBunGlobal(target)) {
    return target.memberName === '$';
  }

  if (findImportSource(target.binding) !== 'bun') {
    return false;
  }

  const specifier = target.binding.defs[0].node;

  return specifier.type === 'ImportSpecifier'
    ? specifier.imported.name === '$'
    : target.memberName === '$';
}

function isBunGlobal(target) {
  return target.rootName === 'Bun' && target.binding === null;
}

const ioModules = new Set(['fs', 'fs/promises', 'child_process']);

function isIOImport(source, target) {
  if (ioModules.has(source.replace(/^node:/u, ''))) {
    return true;
  }

  if (source !== 'bun') {
    return false;
  }

  const specifier = target.binding.defs[0].node;
  const imported =
    specifier.type === 'ImportSpecifier' ? specifier.imported.name : target.memberName;

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

function buildCalledName(context, node, callee) {
  let current = callee;
  let scopeNode = node;

  for (let depth = 0; depth < 8; depth++) {
    if (current.type === 'MemberExpression') {
      return { name: findMemberName(current), isMethod: true };
    }

    if (current.type !== 'Identifier') {
      break;
    }

    const declarator = findAliasDeclarator(findBinding(context, scopeNode, current.name));

    if (declarator === null) {
      return { name: current.name, isMethod: false };
    }

    if (declarator.id.type !== 'Identifier') {
      return { name: findPatternKey(declarator.id, current.name), isMethod: true };
    }

    current = declarator.init;
    scopeNode = declarator.init;
  }

  return { name: null, isMethod: false };
}

function isEnvRead(context, node) {
  return (
    findMemberName(node) === 'env' &&
    (isGlobalName(context, node.object, 'process') || isGlobalName(context, node.object, 'Bun'))
  );
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
