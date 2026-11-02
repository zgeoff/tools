import { dirname, join, normalize } from 'node:path';
import { Visitor, parseSync } from 'oxc-parser';
import type { Expression, StringLiteral } from 'oxc-parser';

export interface SourceFile {
  readonly path: string;

  readonly text: string;
}

const rootTestDirs = ['e2e', 'integration', 'test-utils'] as const;
const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

export function collectTestLayoutFaults(
  trackedPaths: readonly string[],
  sources: readonly SourceFile[],
): string[] {
  const rootDirFaults = rootTestDirs
    .filter((directory) => trackedPaths.some((path) => path.startsWith(`${directory}/`)))
    .map(
      (directory) =>
        `${directory}/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/${directory}/`,
    );

  const importFaults = sources
    .filter((source) => sourcePattern.test(source.path))
    .flatMap((source) =>
      collectRelativeImports(source)
        .map((specifier) => normalize(join(dirname(source.path), specifier)))
        .filter((target) => isForeignHelper(source.path, target))
        .map(
          (target) =>
            `${source.path} imports ${target}, a test helper of ${getWorkspaceRoot(target)}; copy the helper into the importer's own test-utils/`,
        ),
    );

  return [...rootDirFaults, ...importFaults];
}

function collectRelativeImports(source: SourceFile): string[] {
  const specifiers: string[] = [];

  const addLiteral = (node: Expression | StringLiteral | null | undefined): void => {
    if (node?.type === 'Literal' && typeof node.value === 'string') {
      specifiers.push(node.value);
    }

    const [onlyPart] =
      node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis : [];

    if (typeof onlyPart?.value.cooked === 'string') {
      specifiers.push(onlyPart.value.cooked);
    }
  };

  const visitor = new Visitor({
    ImportDeclaration: (node) => {
      addLiteral(node.source);
    },
    ExportNamedDeclaration: (node) => {
      addLiteral(node.source);
    },
    ExportAllDeclaration: (node) => {
      addLiteral(node.source);
    },
    ImportExpression: (node) => {
      addLiteral(node.source);
    },
    TSImportType: (node) => {
      addLiteral(node.source);
    },
    TSExternalModuleReference: (node) => {
      addLiteral(node.expression);
    },
    CallExpression: (node) => {
      const [first] = node.arguments;

      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        first?.type !== 'SpreadElement'
      ) {
        addLiteral(first);
      }
    },
  });

  visitor.visit(parseSync(source.path, source.text).program);

  return specifiers.filter((path) => path.startsWith('./') || path.startsWith('../'));
}

function isForeignHelper(importer: string, target: string): boolean {
  const targetRoot = getWorkspaceRoot(target);
  const helperFolder = targetRoot === '' ? 'test-utils' : `${targetRoot}/test-utils`;
  const isHelper = target === helperFolder || target.startsWith(`${helperFolder}/`);

  return isHelper && targetRoot !== getWorkspaceRoot(importer);
}

function getWorkspaceRoot(path: string): string {
  const segments = path.split('/');

  if (segments.length === 1) {
    return '';
  }

  return segments[0] === 'packages' && segments.length > 2
    ? `packages/${segments[1]}`
    : (segments[0] ?? '');
}
