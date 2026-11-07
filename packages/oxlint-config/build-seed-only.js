import { basename, dirname } from 'node:path';
import collectCreatedTables from './collect-created-tables.js';
import collectSQLWrites from './collect-sql-writes.js';
import collectWrittenTables from './collect-written-tables.js';
import findConstInit from './find-const-init.js';
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

      const collectText = (node) => {
        const text = toSQLText(context, node, new Set());

        if (text === null) {
          return;
        }

        for (const table of collectSQLWrites(text)) {
          // the statement, not its call, so a disable comment above a statement inside a
          // multi-line call covers it
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
          } else if (isKyselyCreateTable(node)) {
            const table = findLiteralTable(node.arguments[0]);

            if (table !== null) {
              createdTables.add(table);
            }
          } else if (isSQLCall(context, node.callee)) {
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

// oxlint-disable-next-line no-template-curly-in-string -- marks an interpolation as a module's text shows it
const interpolation = '${}';

function toSQLText(context, node, seen) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(interpolation);
  }

  // a part the rule cannot read stands for an interpolation, so its table name counts as not a
  // string literal
  if (node?.type === 'BinaryExpression' && node.operator === '+') {
    const left = toSQLText(context, node.left, seen);
    const right = toSQLText(context, node.right, seen);

    return left === null && right === null
      ? null
      : `${left ?? interpolation}${right ?? interpolation}`;
  }

  if (node?.type !== 'Identifier' || seen.has(node.name)) {
    return null;
  }

  const init = findConstInit(context, node);

  return init === null ? null : toSQLText(context, init, new Set([...seen, node.name]));
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

function isKyselyCreateTable(node) {
  const callee = node.callee;

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'createTable'
  );
}

// bun:sqlite and better-sqlite3 run SQL through `run`, `exec`, `query` and `prepare`, Kysely
// through `sql.raw` and `CompiledQuery.raw`, and postgres.js through `sql(…)` and `sql.unsafe`
const sqlMethods = new Set(['run', 'exec', 'query', 'prepare', 'raw', 'unsafe']);

function isSQLCall(context, callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'sql';
  }

  // a regular expression's `exec` takes prose
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    sqlMethods.has(callee.property.name) &&
    !isRegExp(context, callee.object)
  );
}

function isRegExp(context, node) {
  if (node.type === 'Identifier') {
    const init = findConstInit(context, node);

    return init !== null && init.type !== 'Identifier' && isRegExp(context, init);
  }

  return (
    node.regex !== undefined ||
    ((node.type === 'NewExpression' || node.type === 'CallExpression') &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'RegExp')
  );
}

function isSQLTag(tag) {
  const name = tag.type === 'MemberExpression' && !tag.computed ? tag.property : tag;

  return name.type === 'Identifier' && name.name === 'sql';
}
