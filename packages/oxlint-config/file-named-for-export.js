import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import resolvePackageDirectory from './resolve-package-directory.js';
import resolveRepoRoot from './resolve-repo-root.js';
import toPendingPath from './to-pending-path.js';
import toRootPath from './to-root-path.js';

const exemptBases = new Set(['index', 'types', 'constants']);

// a report on one file per repo shows once per run, and an editor's
// language server keeps it on that file across edits
const anchorFiles = new Map();

const fileNamedForExport = {
  meta: {
    type: 'suggestion',
    messages: {
      mismatch:
        "No export of '{{file}}' is named for the file: name the main export '{{base}}' in camelCase, PascalCase or SCREAMING_SNAKE_CASE, or rename the file for its main export.",
      pendingMissing:
        '`{{entry}}` in the `pending` option of zgeoff/file-named-for-export names no package; remove it from `pending`.',
    },
    schema: [
      {
        type: 'object',
        properties: { pending: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = context.physicalFilename;
    const root = resolveRepoRoot(filename) ?? context.cwd;
    const pending = (context.options[0]?.pending ?? []).map((entry) => toPendingPath(entry));
    const directory = pending.length === 0 ? null : resolvePackageDirectory(filename);
    const isPending = directory !== null && pending.includes(toRootPath(root, directory));

    if (!anchorFiles.has(root)) {
      anchorFiles.set(root, filename);
    }

    return {
      Program(program) {
        if (anchorFiles.get(root) === filename) {
          const start = program.body[0]?.loc.start ?? { line: 1, column: 0 };

          for (const entry of readMissingPending(root, pending)) {
            context.report({
              loc: { start, end: start },
              messageId: 'pendingMissing',
              data: { entry },
            });
          }
        }

        if (isPending) {
          return;
        }

        const file = basename(filename);
        const [base, ...suffixes] = file.split('.');

        // a role suffix, such as `.config` or `.bench`, marks a file that a tool loads, and the
        // tool sets its exports
        if (suffixes.length !== 1 || exemptBases.has(base)) {
          return;
        }

        const exports = collectExports(program.body);

        if (exports.statements.length === 0 || exports.names === null) {
          return;
        }

        const wanted = toComparableName(base);

        if (exports.names.some((name) => toComparableName(name) === wanted)) {
          return;
        }

        context.report({
          node: exports.statements[0],
          messageId: 'mismatch',
          data: { file, base },
        });
      },
    };
  },
};

export default fileNamedForExport;

function readMissingPending(root, pending) {
  return pending.filter((entry) => !existsSync(join(root, entry, 'package.json')));
}

const exportTypes = new Set([
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
  'TSExportAssignment',
]);

// an `export * from` or an `export { default } from` hides the name it exports, so names is null
// and the file passes
function collectExports(body) {
  const statements = body.filter(
    (statement) => exportTypes.has(statement.type) && !isEmptyExport(statement),
  );
  const names = [];

  for (const statement of statements) {
    const exported = collectExportNames(statement);

    if (exported === null) {
      return { statements, names: null };
    }

    names.push(...exported);
  }

  return { statements, names };
}

// `export {}` only marks a script as a module
function isEmptyExport(statement) {
  return (
    statement.type === 'ExportNamedDeclaration' &&
    statement.declaration === null &&
    statement.specifiers.length === 0
  );
}

function collectExportNames(statement) {
  if (statement.type === 'ExportAllDeclaration') {
    return statement.exported === null ? null : [toExportName(statement.exported)];
  }

  if (statement.type === 'TSExportAssignment') {
    return collectValueNames(statement.expression);
  }

  if (statement.type === 'ExportDefaultDeclaration') {
    return collectValueNames(statement.declaration);
  }

  if (statement.declaration !== null) {
    return collectDeclarationNames(statement.declaration);
  }

  const names = statement.specifiers.map((specifier) => {
    const exported = toExportName(specifier.exported);

    return exported === 'default' ? toExportName(specifier.local) : exported;
  });

  return statement.source !== null && names.includes('default') ? null : names;
}

function toExportName(node) {
  return node.type === 'Identifier' ? node.name : node.value;
}

const wrapperTypes = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function collectValueNames(value) {
  if (wrapperTypes.has(value.type)) {
    return collectValueNames(value.expression);
  }

  if (value.type === 'Identifier') {
    return [value.name];
  }

  return value.id?.type === 'Identifier' ? [value.id.name] : [];
}

function collectDeclarationNames(declaration) {
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap((declarator) => collectPatternNames(declarator.id));
  }

  return declaration.id === null || declaration.id === undefined
    ? []
    : [toRootName(declaration.id)];
}

function collectPatternNames(pattern) {
  if (pattern.type === 'Identifier') {
    return [pattern.name];
  }

  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.flatMap((property) => {
      const target = property.type === 'RestElement' ? property.argument : property.value;

      return collectPatternNames(target);
    });
  }

  if (pattern.type === 'ArrayPattern') {
    return pattern.elements.flatMap((element) =>
      element === null ? [] : collectPatternNames(element),
    );
  }

  if (pattern.type === 'AssignmentPattern') {
    return collectPatternNames(pattern.left);
  }

  return pattern.type === 'RestElement' ? collectPatternNames(pattern.argument) : [];
}

function toRootName(name) {
  if (name.type === 'TSQualifiedName') {
    return toRootName(name.left);
  }

  return toExportName(name);
}

function toComparableName(name) {
  return name.replaceAll(/[-_]/gu, '').toLowerCase();
}
