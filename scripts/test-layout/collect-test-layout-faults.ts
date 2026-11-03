import { dirname, join, normalize } from 'node:path';
import { Visitor, parseSync } from 'oxc-parser';
import type { Expression, Program, StringLiteral } from 'oxc-parser';

export interface SourceFile {
  readonly path: string;

  readonly text: string;
}

const rootTestDirs = ['e2e', 'integration', 'test-utils'] as const;
const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const oldHelperPattern = /^(?<root>packages\/[^/]+)\/test-utils\//u;

export function collectTestLayoutFaults(
  trackedPaths: readonly string[],
  sources: readonly SourceFile[],
): string[] {
  const rootDirFaults = rootTestDirs
    .filter((directory) => trackedPaths.some((path) => path.startsWith(`${directory}/`)))
    .map(
      (directory) =>
        `${directory}/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/${directory === 'test-utils' ? 'src/' : ''}${directory}/`,
    );

  const packageDirFaults = [
    ...new Set(trackedPaths.flatMap((path) => oldHelperPattern.exec(path)?.groups?.['root'] ?? [])),
  ].map(
    (root) =>
      `${root}/test-utils/ holds test helpers outside src/; move each file into ${root}/src/test-utils/`,
  );

  const importFaults = sources
    .filter((source) => sourcePattern.test(source.path))
    .flatMap((source) => {
      const parsed = parseSync(source.path, source.text);
      const [parseError] = parsed.errors;

      if (parseError !== undefined) {
        return [
          `${source.path} does not parse, so the layout check cannot read its imports: ${parseError.message}`,
        ];
      }

      return collectImportSpecifiers(parsed.program).flatMap((specifier) =>
        collectImportFaults(source.path, specifier),
      );
    });

  return [...rootDirFaults, ...packageDirFaults, ...importFaults];
}

function collectImportSpecifiers(program: Program): string[] {
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

  visitor.visit(program);

  return specifiers;
}

const packageHelperPattern = /^@[^/]+\/[^/]+\/test-utils(?:\/|$)/u;

function collectImportFaults(importer: string, specifier: string): string[] {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const target = isRelative ? normalize(join(dirname(importer), specifier)) : specifier;
  const isHelper = isRelative ? isHelperPath(target) : packageHelperPattern.test(specifier);

  if (isHelper && isProductionCode(importer)) {
    return [
      `${importer} imports ${target}, a test helper, from production code; import test helpers only from tests and other test helpers`,
    ];
  }

  if (!isRelative || !isHelper) {
    return [];
  }

  const targetRoot = getWorkspaceRoot(target);

  if (targetRoot === getWorkspaceRoot(importer)) {
    return [];
  }

  const fix = targetRoot.startsWith('packages/')
    ? "import it by the package's name, with the package as a workspace:* dev dependency"
    : "copy the helper into the importer's own test-utils/";

  return [`${importer} imports ${target}, a test helper of ${targetRoot}; ${fix}`];
}

function isHelperPath(path: string): boolean {
  const folder = getHelperFolder(getWorkspaceRoot(path));

  return path === folder || path.startsWith(`${folder}/`);
}

function getHelperFolder(root: string): string {
  if (root === '') {
    return 'test-utils';
  }

  return root.startsWith('packages/') ? `${root}/src/test-utils` : `${root}/test-utils`;
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

const packageTestDirs = new Set(['e2e', 'integration', 'evals', 'bench', 'test-utils']);

function isProductionCode(path: string): boolean {
  const root = getWorkspaceRoot(path);

  if (root === '' || isHelperPath(path) || /\.test\.[^/]+$/u.test(path)) {
    return false;
  }

  const [folder] = path.slice(root.length + 1).split('/');

  return !root.startsWith('packages/') || !packageTestDirs.has(folder ?? '');
}
