import { dirname, join, normalize } from 'node:path';
import { collectImportSpecifiers } from './collect-import-specifiers.ts';
import type { OxcParserModule } from './oxc-parser-module.ts';
import type { SourceFile, TestLayout } from './types.ts';

const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

// The faults of imports: a relative import of another workspace's helper, and production code that
// imports a helper.
export function collectImportFaults(
  oxc: OxcParserModule,
  layout: TestLayout,
  sources: readonly SourceFile[],
): string[] {
  return sources
    .filter((source) => sourcePattern.test(source.path))
    .flatMap((source) => {
      const parsed = oxc.parseSync(source.path, source.text);
      const [parseError] = parsed.errors;

      if (parseError !== undefined) {
        return [
          `${source.path} does not parse, so the layout check cannot read its imports: ${parseError.message}`,
        ];
      }

      return collectImportSpecifiers(oxc, parsed.program).flatMap((specifier) =>
        collectSpecifierFaults(layout, source.path, specifier),
      );
    });
}

const packageHelperPattern = /^@[^/]+\/[^/]+\/test-utils(?:\/|$)/u;

function collectSpecifierFaults(layout: TestLayout, importer: string, specifier: string): string[] {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const target = isRelative ? normalize(join(dirname(importer), specifier)) : specifier;
  const isHelper = isRelative ? isHelperPath(layout, target) : packageHelperPattern.test(specifier);

  if (isHelper && isProductionCode(layout, importer)) {
    return [
      `${importer} imports ${target}, a test helper, from production code; import test helpers only from tests and other test helpers`,
    ];
  }

  if (!isRelative || !isHelper) {
    return [];
  }

  const targetRoot = getWorkspaceRoot(layout, target);

  if (targetRoot === getWorkspaceRoot(layout, importer)) {
    return [];
  }

  const fix = layout.workspaces.includes(targetRoot)
    ? "import it by the package's name, with the package as a workspace:* dev dependency"
    : "copy the helper into the importer's own test-utils/";

  return [`${importer} imports ${target}, a test helper of ${targetRoot}; ${fix}`];
}

function isHelperPath(layout: TestLayout, path: string): boolean {
  const folder = getHelperFolder(layout, getWorkspaceRoot(layout, path));

  return path === folder || path.startsWith(`${folder}/`);
}

function getHelperFolder(layout: TestLayout, root: string): string {
  if (layout.workspaces.includes(root)) {
    return `${root}/src/test-utils`;
  }

  if (root === '') {
    return layout.isWorkspaceRepo ? 'test-utils' : 'src/test-utils';
  }

  return `${root}/test-utils`;
}

// A path belongs to its workspace, to the single package of a repo with no workspaces, or else to
// the top-level folder it sits in, such as scripts/.
function getWorkspaceRoot(layout: TestLayout, path: string): string {
  const workspace = layout.workspaces.find((root) => path.startsWith(`${root}/`));

  if (workspace !== undefined) {
    return workspace;
  }

  const segments = path.split('/');

  if (!layout.isWorkspaceRepo || segments.length === 1) {
    return '';
  }

  return segments[0] ?? '';
}

const packageTestFolders = new Set(['e2e', 'evals', 'bench', 'test-utils']);

function isProductionCode(layout: TestLayout, path: string): boolean {
  const root = getWorkspaceRoot(layout, path);

  if ((root === '' && layout.isWorkspaceRepo) || isHelperPath(layout, path)) {
    return false;
  }

  if (/\.(?:test|bench)\.[^/]+$/u.test(path)) {
    return false;
  }

  const isPackage = layout.workspaces.includes(root) || (root === '' && !layout.isWorkspaceRepo);

  if (!isPackage) {
    return true;
  }

  const relativePath = root === '' ? path : path.slice(root.length + 1);
  const [folder] = relativePath.split('/');

  return !packageTestFolders.has(folder ?? '');
}
