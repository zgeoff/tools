import { basename, dirname } from 'node:path';
import collectSQLWrites from './collect-sql-writes.js';
import collectWrittenTables from './collect-written-tables.js';
import findFunctionName from './find-function-name.js';
import isInTestUtils from './is-in-test-utils.js';
import isVerbMatch from './is-verb-match.js';
import resolveRepoPath from './resolve-repo-path.js';
import toTableName from './to-table-name.js';

export default function buildSeedOnly(readFolderSources) {
  const folderTables = new Map();

  const readFolderTables = (directory) => {
    const cached = folderTables.get(directory);

    if (cached !== undefined) {
      return cached;
    }

    const tables = new Set(
      readFolderSources(directory).flatMap((text) => collectWrittenTables(text)),
    );

    folderTables.set(directory, tables);

    return tables;
  };

  return {
    meta: {
      type: 'problem',
      messages: {
        write:
          "Seed '{{table}}' through the module that writes it, with a `seed…` function from its `test-utils`. A direct write passes only inside a `seed…` function in `test-utils`, in a test beside a module that writes '{{table}}', in a migration test and in a seed's own test.",
        nonLiteral:
          "Name the table in a string literal: the rule finds a table's owner by the table's name.",
      },
      schema: [],
    },
    create(context) {
      const filename = context.physicalFilename;
      const kind = pickFileKind(resolveRepoPath(filename, context.cwd), basename(filename));

      if (kind === null) {
        return {};
      }

      const checkWrite = (node, table) => {
        if (kind.inTestUtils && isInSeedFunction(node)) {
          return;
        }

        if (table === null) {
          context.report({ node, messageId: 'nonLiteral' });
        } else if (!kind.isTest || !readFolderTables(dirname(filename)).has(table)) {
          context.report({ node, messageId: 'write', data: { table } });
        }
      };

      return {
        CallExpression(node) {
          if (isKyselyWrite(node)) {
            checkWrite(node, findLiteralTable(node.arguments[0]));
          }
        },
        Literal(node) {
          if (typeof node.value === 'string') {
            for (const table of collectSQLWrites(node.value)) {
              checkWrite(node, table);
            }
          }
        },
        TemplateLiteral(node) {
          const text = node.quasis
            .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
            // oxlint-disable-next-line no-template-curly-in-string -- marks each interpolation as a module's text shows it
            .join('${}');

          for (const table of collectSQLWrites(text)) {
            checkWrite(node, table);
          }
        },
      };
    },
  };
}

const testFilePattern = /\.test\.tsx?$/u;
const seedTestPattern = /^seed-.+\.test\.tsx?$/u;
const migrationPattern = /migrat(?:e|ion)/iu;

// a migration test and a seed's own test may write tables directly, and only test code is checked
function pickFileKind(repoPath, name) {
  const inTestUtils = isInTestUtils(repoPath);
  const isTest = testFilePattern.test(name);

  if (isTest && (migrationPattern.test(repoPath) || (inTestUtils && seedTestPattern.test(name)))) {
    return null;
  }

  return isTest || inTestUtils ? { inTestUtils, isTest } : null;
}

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isInSeedFunction(node) {
  for (
    let current = node.parent;
    current !== null && current !== undefined;
    current = current.parent
  ) {
    const name = functionTypes.has(current.type) ? findFunctionName(current) : null;

    if (name !== null && isVerbMatch(name.name, 'seed')) {
      return true;
    }
  }

  return false;
}

const kyselyWriteMethods = new Set(['insertInto', 'updateTable', 'deleteFrom']);

function isKyselyWrite(node) {
  const callee = node.callee;

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    kyselyWriteMethods.has(callee.property.name)
  );
}

function findLiteralTable(argument) {
  return argument?.type === 'Literal' && typeof argument.value === 'string'
    ? toTableName(argument.value)
    : null;
}
