import type { Argument } from 'oxc-parser';
import { Visitor, parseSync } from 'oxc-parser';

// The file name picks the parser's language from its extension, such as TypeScript for `.ts`.
export function collectImportSpecifiers(source: string, filename: string): string[] | null {
  const parsed = parseSync(filename, source);

  if (parsed.errors.length > 0) {
    return null;
  }

  const specifiers: (string | null)[] = [];

  new Visitor({
    ImportDeclaration: (node) => {
      specifiers.push(node.source.value);
    },
    ExportNamedDeclaration: (node) => {
      specifiers.push(node.source?.value ?? null);
    },
    ExportAllDeclaration: (node) => {
      specifiers.push(node.source.value);
    },
    ImportExpression: (node) => {
      specifiers.push(findStaticText(node.source));
    },
    TSImportType: (node) => {
      specifiers.push(node.source.value);
    },
    TSExternalModuleReference: (node) => {
      specifiers.push(node.expression.value);
    },
    CallExpression: (node) => {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        specifiers.push(findStaticText(node.arguments[0]));
      }
    },
  }).visit(parsed.program);

  return specifiers.filter((specifier) => specifier !== null);
}

function findStaticText(node: Argument | undefined): string | null {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }

  return null;
}
