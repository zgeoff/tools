import { readFileSync } from 'node:fs';
import type { Argument } from 'oxc-parser';
import { Visitor, parseSync } from 'oxc-parser';
import { writeStdout } from '../packages/std/src/write-stdout.ts';

// The file name picks the parser's language from its extension, such as TypeScript for `.ts`.
export function collectPackageImports(source: string, filename: string): string[] | null {
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

  const packages = specifiers
    .filter((specifier) => specifier !== null)
    .filter((specifier) => !/^(?:\.|\/|node:|bun:|bun$)/u.test(specifier))
    .map(
      (specifier) =>
        /^(?<name>@[^/]+\/[^/]+|[^/]+)/u.exec(specifier)?.groups?.['name'] ?? specifier,
    );

  return [...new Set(packages)].toSorted();
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

if (import.meta.main) {
  const path = process.argv[2] ?? '';
  const packages = collectPackageImports(readFileSync(path, 'utf8'), path);

  if (packages === null) {
    process.stderr.write(`collect-package-imports: ${path} does not parse\n`);

    process.exitCode = 1;
  } else {
    writeStdout(packages.map((name) => `${name}\n`).join(''));
  }
}
