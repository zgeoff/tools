import { basename, dirname } from 'node:path';
import collectSQLWrites from './collect-sql-writes.js';
import collectWrittenTables from './collect-written-tables.js';
import findBunTestName from './find-bun-test-name.js';
import findChainRoot from './find-chain-root.js';
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
      readFolderSources(directory)
        .filter((source) => !source.name.startsWith('seed-'))
        .flatMap((source) => collectWrittenTables(source.text)),
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

      const checkText = (node, text) => {
        if (!isTestTitle(context, node)) {
          for (const table of collectSQLWrites(text)) {
            checkWrite(node, table);
          }
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
            checkText(node, node.value);
          }
        },
        TemplateLiteral(node) {
          const text = node.quasis
            .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
            // oxlint-disable-next-line no-template-curly-in-string -- marks each interpolation as a module's text shows it
            .join('${}');

          checkText(node, text);
        },
      };
    },
  };
}

const testFilePattern = /\.test\.tsx?$/u;
const seedTestPattern = /^seed-.+\.test\.tsx?$/u;
const migrationWords = new Set(['migrate', 'migration', 'migrations']);

function pickFileKind(repoPath, name) {
  const inTestUtils = isInTestUtils(repoPath);
  const isTest = testFilePattern.test(name);
  const isMigrationTest = repoPath.split(/[-./\\_]/u).some((word) => migrationWords.has(word));

  if (isTest && (isMigrationTest || (inTestUtils && seedTestPattern.test(name)))) {
    return null;
  }

  return isTest || inTestUtils ? { inTestUtils, isTest } : null;
}

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

// a seed's callbacks write for the seed, while a seed-named helper inside another function does not
function isInSeedFunction(node) {
  let outermost = null;

  for (
    let current = node.parent;
    current !== null && current !== undefined;
    current = current.parent
  ) {
    if (functionTypes.has(current.type)) {
      outermost = current;
    }
  }

  const name = outermost === null ? null : findFunctionName(outermost);

  return name !== null && isVerbMatch(name.name, 'seed');
}

const testRunnerNames = new Set(['test', 'it', 'describe']);

function isTestTitle(context, node) {
  const call = node.parent;

  if (call?.type !== 'CallExpression' || call.arguments[0] !== node) {
    return false;
  }

  const root = findChainRoot(call.callee, true);

  return root !== null && testRunnerNames.has(findBunTestName(context, root));
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
