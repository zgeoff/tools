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
            constants.push(statement);

            continue;
          }

          emitReport(context, statement);
        }

        const gates = collectSkipGates(context, constants);

        for (const declaration of constants) {
          if (!gates.has(declaration)) {
            emitReport(context, declaration);
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

function emitReport(context, statement) {
  const name = findDeclaredName(context, statement);

  if (name === undefined) {
    context.report({ node: statement, messageId: 'statement' });

    return;
  }

  context.report({ node: statement, messageId: 'declaration', data: { name } });
}

function findDeclaredName(context, statement) {
  if (statement.type === 'VariableDeclaration') {
    return context.sourceCode
      .getDeclaredVariables(statement)
      .map((variable) => variable.name)
      .join('`, `');
  }

  return statement.id?.name;
}

// a skip gate is a `const` whose every read sits in a `skipIf(...)` argument
// or in another gate's initializer, as a gate derived from the awaited probe
// does; the set shrinks until every member holds
function collectSkipGates(context, constants) {
  const gates = new Set(constants);
  let changed = true;

  while (changed) {
    changed = false;

    for (const declaration of gates) {
      if (!isSkipGate(context, declaration, gates)) {
        gates.delete(declaration);
        changed = true;
      }
    }
  }

  return gates;
}

function isSkipGate(context, declaration, gates) {
  const reads = context.sourceCode
    .getDeclaredVariables(declaration)
    .flatMap((variable) => variable.references)
    .filter((reference) => !reference.init && reference.isRead());

  return (
    reads.length > 0 &&
    reads.every(
      (reference) =>
        isInSkipIfArgument(reference.identifier) || isInGateInit(reference.identifier, gates),
    )
  );
}

function isInSkipIfArgument(identifier) {
  let child = identifier;

  for (let node = identifier.parent; node !== null && node !== undefined; node = node.parent) {
    if (
      node.type === 'CallExpression' &&
      node.arguments.includes(child) &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.name === 'skipIf'
    ) {
      return true;
    }

    child = node;
  }

  return false;
}

function isInGateInit(identifier, gates) {
  let child = identifier;

  for (let node = identifier.parent; node !== null && node !== undefined; node = node.parent) {
    if (node.type === 'VariableDeclarator') {
      return node.init === child && gates.has(node.parent);
    }

    child = node;
  }

  return false;
}

export default setupTestOnly;
