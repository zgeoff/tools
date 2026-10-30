import { basename } from 'node:path';
import bannedTestCalls from './banned-test-calls.js';
import getImportedName from './get-imported-name.js';
import isBunTestFile from './is-bun-test-file.js';

const testFilePattern = /\.test\.tsx?$/u;

const allowedStatementTypes = new Set([
  'ImportDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
]);

const setupTestOnly = {
  meta: {
    type: 'problem',
    messages: {
      declaration:
        'Remove the module-level `{{name}}`: a test file declares one function, `setupTest()`, and nothing else. Inline it where it is used, swap it for a registered matcher, or move it to the shared test utils with tests of its own. A module-level `const` stays only as a skip gate that `skipIf(...)` arguments alone read.',
      statement:
        'Move this statement into a test or `setupTest()`: at module level a test file holds only imports, types, `setupTest()` and `test` calls.',
      modifier:
        '`test.{{modifier}}` is banned: use `test.skipIf(<condition>)` for a skip. Committed `skip`, `todo`, `only` and `failing` tests are not allowed.',
      concurrent: '`test.concurrent` is banned: tests that use `onTestFinished` run in order.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        if (!testFilePattern.test(basename(context.physicalFilename))) {
          return;
        }

        const testNames = collectTestNames(context, program);
        const shapeCalls = isBunTestFile(program) ? bannedTestCalls : new Set();
        const constants = [];
        let hasSetupTest = false;

        for (const statement of program.body) {
          if (
            allowedStatementTypes.has(statement.type) ||
            isTestCall(statement, testNames) ||
            isShapeCall(statement, shapeCalls)
          ) {
            continue;
          }

          if (
            statement.type === 'FunctionDeclaration' &&
            statement.id?.name === 'setupTest' &&
            !hasSetupTest
          ) {
            hasSetupTest = true;

            continue;
          }

          if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
            constants.push(...statement.declarations);

            continue;
          }

          const modifier = findBannedModifier(statement, testNames);

          if (modifier === null) {
            emitReport(context, statement);
          } else {
            const messageId = modifier === 'concurrent' ? 'concurrent' : 'modifier';

            context.report({ node: statement, messageId, data: { modifier } });
          }
        }

        const gates = collectSkipGates(context, constants, testNames);
        const declarations = new Set(constants.map((declarator) => declarator.parent));

        for (const declaration of declarations) {
          const leaks = declaration.declarations.filter((declarator) => !gates.has(declarator));

          if (leaks.length > 0) {
            emitReport(context, declaration, leaks);
          }
        }
      },
    };
  },
};

const testModules = new Set(['bun:test', 'claude-code/testing']);

function collectTestNames(context, program) {
  const names = program.body
    .filter(
      (statement) =>
        statement.type === 'ImportDeclaration' &&
        testModules.has(statement.source.value) &&
        statement.importKind !== 'type',
    )
    .flatMap((statement) => statement.specifiers)
    .filter(
      (specifier) =>
        specifier.type === 'ImportSpecifier' &&
        specifier.importKind !== 'type' &&
        getImportedName(specifier) === 'test',
    )
    .map((specifier) => specifier.local.name);

  if (names.length === 0 && !hasModuleBinding(context, program, 'test')) {
    return new Set(['test']);
  }

  return new Set(names);
}

// ESM puts module-level bindings in a module scope nested under the global one
function hasModuleBinding(context, program, name) {
  const scope = context.sourceCode.getScope(program);
  const scopes = [scope, ...scope.childScopes.filter((child) => child.type === 'module')];

  return scopes.some((candidate) => (candidate.set.get(name)?.defs.length ?? 0) > 0);
}

function isTestCall(statement, testNames) {
  return (
    statement.type === 'ExpressionStatement' &&
    statement.expression.type === 'CallExpression' &&
    isTestRunner(statement.expression.callee, testNames)
  );
}

const testModifiers = new Set(['each', 'skipIf', 'if']);

function isTestRunner(node, testNames) {
  let current = node;

  while (current.type !== 'Identifier') {
    if (current.type === 'CallExpression') {
      current = current.callee;
    } else if (
      current.type === 'MemberExpression' &&
      !current.computed &&
      testModifiers.has(current.property.name)
    ) {
      current = current.object;
    } else {
      return false;
    }
  }

  return testNames.has(current.name);
}

// zgeoff/test-shape reports these calls in a bun:test file with advice of its own
function isShapeCall(statement, shapeCalls) {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') {
    return false;
  }

  let callee = statement.expression.callee;

  while (callee.type === 'CallExpression' || callee.type === 'MemberExpression') {
    callee = callee.type === 'CallExpression' ? callee.callee : callee.object;
  }

  return callee.type === 'Identifier' && shapeCalls.has(callee.name);
}

const bannedModifiers = new Set(['concurrent', 'skip', 'todo', 'only', 'failing']);

function findBannedModifier(statement, testNames) {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') {
    return null;
  }

  const modifiers = [];
  let current = statement.expression.callee;

  while (current.type === 'CallExpression' || current.type === 'MemberExpression') {
    if (current.type === 'CallExpression') {
      current = current.callee;
    } else {
      if (!current.computed) {
        modifiers.push(current.property.name);
      }

      current = current.object;
    }
  }

  if (current.type !== 'Identifier' || !testNames.has(current.name)) {
    return null;
  }

  return modifiers.includes('concurrent')
    ? 'concurrent'
    : (modifiers.find((modifier) => bannedModifiers.has(modifier)) ?? null);
}

function emitReport(context, statement, declarators) {
  const name = findDeclaredName(context, statement, declarators);

  if (name === undefined) {
    context.report({ node: statement, messageId: 'statement' });

    return;
  }

  context.report({ node: statement, messageId: 'declaration', data: { name } });
}

function findDeclaredName(context, statement, declarators) {
  if (statement.type === 'VariableDeclaration') {
    return (declarators ?? statement.declarations)
      .flatMap((declarator) => context.sourceCode.getDeclaredVariables(declarator))
      .map((variable) => variable.name)
      .join('`, `');
  }

  return statement.id?.name;
}

function collectSkipGates(context, constants, testNames) {
  const gates = new Set();
  let changed = true;

  while (changed) {
    changed = false;

    for (const declarator of constants) {
      if (!gates.has(declarator) && isSkipGate(context, declarator, gates, testNames)) {
        gates.add(declarator);
        changed = true;
      }
    }
  }

  return gates;
}

function isSkipGate(context, declarator, gates, testNames) {
  const variables = context.sourceCode.getDeclaredVariables(declarator);

  return (
    variables.length > 0 &&
    variables.every((variable) => {
      const reads = variable.references.filter(
        (reference) => !reference.init && reference.isRead(),
      );

      return (
        reads.length > 0 &&
        reads.every(
          (reference) =>
            isInSkipIfArgument(reference.identifier, testNames) ||
            isInGateInit(reference.identifier, gates),
        )
      );
    })
  );
}

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

// bun test reads a `skipIf` gate as it collects tests, so a read inside a
// function, which runs later, does not count
function isInSkipIfArgument(identifier, testNames) {
  let child = identifier;
  let isSkipIfArgument = false;

  for (let node = identifier.parent; node !== null && node !== undefined; node = node.parent) {
    if (functionTypes.has(node.type)) {
      return false;
    }

    if (
      node.type === 'CallExpression' &&
      node.arguments.includes(child) &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.name === 'skipIf' &&
      isTestRunner(node.callee.object, testNames)
    ) {
      isSkipIfArgument = true;
    }

    child = node;
  }

  return isSkipIfArgument;
}

function isInGateInit(identifier, gates) {
  let child = identifier;

  for (let node = identifier.parent; isOutsideFunction(node); node = node.parent) {
    if (node.type === 'VariableDeclarator') {
      return node.init === child && gates.has(node);
    }

    child = node;
  }

  return false;
}

function isOutsideFunction(node) {
  return node !== null && node !== undefined && !functionTypes.has(node.type);
}

export default setupTestOnly;
