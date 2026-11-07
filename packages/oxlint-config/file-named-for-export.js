import { basename } from 'node:path';

const exemptBases = new Set(['index', 'types', 'constants']);

const fileNamedForExport = {
  meta: {
    type: 'suggestion',
    messages: {
      mismatch:
        "No export of '{{file}}' is named for the file: name the main export '{{base}}' in camelCase, PascalCase or SCREAMING_SNAKE_CASE, or rename the file for its main export.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const file = basename(context.physicalFilename);
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

const exportTypes = new Set([
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
  'TSExportAssignment',
]);

// an `export * from` hides the names it exports, so names is null and the file passes
function collectExports(body) {
  const statements = body.filter((statement) => exportTypes.has(statement.type));
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

  return statement.specifiers.map((specifier) => {
    const exported = toExportName(specifier.exported);

    return exported === 'default' ? toExportName(specifier.local) : exported;
  });
}

function toExportName(node) {
  return node.type === 'Identifier' ? node.name : node.value;
}

function collectValueNames(value) {
  if (value.type === 'Identifier') {
    return [value.name];
  }

  return value.id?.type === 'Identifier' ? [value.id.name] : [];
}

function collectDeclarationNames(declaration) {
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap((declarator) => collectPatternNames(declarator.id));
  }

  return declaration.id?.type === 'Identifier' ? [declaration.id.name] : [];
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

function toComparableName(name) {
  return name.replaceAll(/[-_]/gu, '').toLowerCase();
}
