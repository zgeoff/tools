import { basename, dirname } from 'node:path';
import collectCreatedTables from './collect-created-tables.js';
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

      // a table the file creates is the test's own, so a write to it counts only once the whole
      // file is read
      const writes = [];
      const createdTables = new Set();

      // reports at the statement, so a disable comment above a statement inside a multi-line call
      // covers it
      const collectText = (node) => {
        const text = toSQLText(node);

        if (text === null) {
          return;
        }

        for (const table of collectSQLWrites(text)) {
          writes.push({ node, table });
        }

        for (const table of collectCreatedTables(text)) {
          createdTables.add(table);
        }
      };

      const checkWrite = (write) => {
        if ((kind.inTestUtils && isInSeedFunction(write.node)) || createdTables.has(write.table)) {
          return;
        }

        if (write.table === null) {
          context.report({ node: write.node, messageId: 'nonLiteral' });
        } else if (!kind.isTest || !readFolderTables(dirname(filename)).has(write.table)) {
          context.report({ node: write.node, messageId: 'write', data: { table: write.table } });
        }
      };

      return {
        CallExpression(node) {
          if (isKyselyWrite(node)) {
            writes.push({ node, table: findLiteralTable(node.arguments[0]) });
          } else if (isSQLCall(node.callee)) {
            collectText(node.arguments[0]);
          }
        },
        TaggedTemplateExpression(node) {
          if (isSQLTag(node.tag)) {
            collectText(node.quasi);
          }
        },
        'Program:exit'() {
          for (const write of writes) {
            checkWrite(write);
          }
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

function toSQLText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral') {
    return (
      node.quasis
        .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
        // oxlint-disable-next-line no-template-curly-in-string -- marks each interpolation as a module's text shows it
        .join('${}')
    );
  }

  return null;
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

// bun:sqlite and better-sqlite3 run SQL through `run`, `exec`, `query` and `prepare`, Kysely
// through `sql.raw` and `CompiledQuery.raw`, and postgres.js through `sql(…)` and `sql.unsafe`
const sqlMethods = new Set(['run', 'exec', 'query', 'prepare', 'raw', 'unsafe']);

function isSQLCall(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'sql';
  }

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    sqlMethods.has(callee.property.name)
  );
}

function isSQLTag(tag) {
  const name = tag.type === 'MemberExpression' && !tag.computed ? tag.property : tag;

  return name.type === 'Identifier' && name.name === 'sql';
}
