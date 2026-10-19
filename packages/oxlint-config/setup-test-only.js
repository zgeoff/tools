import { basename } from 'node:path';

const testFilePattern = /\.test\.tsx?$/u;

// the statements a test file holds besides its tests and `setupTest()`:
// imports and type-only declarations, which run nothing at module level
const allowedStatementTypes = new Set([
  'ImportDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
]);

// the members a `test` call may chain: `test.each(rows)(…)`,
// `test.skipIf(gate)(…)`, `test.if(gate)(…)`
const testModifiers = new Set(['each', 'skipIf', 'if']);

const setupTestOnly = {
  meta: {
    type: 'problem',
    messages: {
      declaration:
        'Remove the module-level `{{name}}`: a test file declares one function, `setupTest()`, and nothing else. Inline it where it is used, swap it for a registered matcher, or move it to the shared test utils with tests of its own. A module-level `const` stays only as a skip gate that `skipIf(...)` arguments alone read.',
      statement:
        'Move this statement into a test or `setupTest()`: at module level a test file holds only imports, types, `setupTest()` and `test` calls.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        if (!testFilePattern.test(basename(context.physicalFilename))) {
          return;
        }

        const constants = [];
        let hasSetupTest = false;

        for (const statement of program.body) {
          if (allowedStatementTypes.has(statement.type) || isTestCall(statement)) {
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

          emitReport(context, statement);
        }

        const gates = collectSkipGates(context, constants);
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

function isTestCall(statement) {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') {
    return false;
  }

  let node = statement.expression.callee;

  while (node.type !== 'Identifier') {
    if (node.type === 'CallExpression') {
      node = node.callee;
    } else if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      testModifiers.has(node.property.name)
    ) {
      node = node.object;
    } else {
      return false;
    }
  }

  return node.name === 'test';
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

// a gate is a declarator whose every binding is read, only in a `skipIf(...)`
// argument or another gate's initializer; the set grows out from the `skipIf`
// reads, so consts that only read each other never join it
function collectSkipGates(context, constants) {
  const gates = new Set();
  let changed = true;

  while (changed) {
    changed = false;

    for (const declarator of constants) {
      if (!gates.has(declarator) && isSkipGate(context, declarator, gates)) {
        gates.add(declarator);
        changed = true;
      }
    }
  }

  return gates;
}

function isSkipGate(context, declarator, gates) {
  return context.sourceCode.getDeclaredVariables(declarator).every((variable) => {
    const reads = variable.references.filter((reference) => !reference.init && reference.isRead());

    return (
      reads.length > 0 &&
      reads.every(
        (reference) =>
          isInSkipIfArgument(reference.identifier) || isInGateInit(reference.identifier, gates),
      )
    );
  });
}

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

// a read counts only at collection time, so no function may enclose it: a
// `skipIf` inside `setupTest()` or a test runs later
function isInSkipIfArgument(identifier) {
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
      node.callee.property.name === 'skipIf'
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
