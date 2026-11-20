import { dirname, join, normalize } from 'node:path';
import { collectImportSpecifiers } from './collect-import-specifiers.ts';
import type { OxcParserModule } from './oxc-parser-module.ts';
import type { SourceFile, TestLayout } from './types.ts';

const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

interface ParsedImports {
  readonly path: string;

  readonly specifiers: readonly string[];
}

// The faults of imports: a relative import of another workspace's helper, and production code that
// imports a helper.
export function collectImportFaults(
  oxc: OxcParserModule,
  layout: TestLayout,
  sources: readonly SourceFile[],
): string[] {
  const parseFaults: string[] = [];
  const imports: ParsedImports[] = [];

  for (const source of sources.filter((candidate) => sourcePattern.test(candidate.path))) {
    const parsed = oxc.parseSync(source.path, source.text);
    const [parseError] = parsed.errors;

    if (parseError === undefined) {
      imports.push({
        path: source.path,
        specifiers: collectImportSpecifiers(oxc, parsed.program),
      });
    } else {
      parseFaults.push(
        `${source.path} does not parse, so the layout check cannot read its imports: ${parseError.message}`,
      );
    }
  }

  const testOnlyRoots = collectTestOnlyWorkspaces(layout, imports);

  return [
    ...parseFaults,
    ...imports.flatMap((file) =>
      file.specifiers.flatMap((specifier) =>
        collectSpecifierFaults(layout, testOnlyRoots, file.path, specifier),
      ),
    ),
  ];
}

// A private workspace that no production file imports. A root-level source such as cli.ts counts
// as production here, though it may import helpers itself. The check runs to a fixed point: a workspace that a test-only workspace imports counts as imported
// by test code.
function collectTestOnlyWorkspaces(
  layout: TestLayout,
  imports: readonly ParsedImports[],
): ReadonlySet<string> {
  const candidates = new Map(
    layout.workspacePackages
      .filter((workspace) => workspace.isPrivate && workspace.name !== '')
      .map((workspace) => [workspace.root, workspace.name]),
  );

  let changed = true;

  while (changed) {
    changed = false;

    const roots = new Set(candidates.keys());

    for (const [root, name] of candidates) {
      const importers = imports
        .filter((file) => getWorkspaceRoot(layout, file.path) !== root)
        .filter((file) =>
          file.specifiers.some(
            (specifier) => specifier === name || specifier.startsWith(`${name}/`),
          ),
        )
        .map((file) => file.path);

      const isImportedOnlyByTests = importers.every(
        (path) => !isProductionImporter(layout, roots, path),
      );

      if (!isImportedOnlyByTests) {
        candidates.delete(root);

        changed = true;
      }
    }
  }

  return new Set(candidates.keys());
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

// Whether a file's import keeps its target in production. Unlike isProductionCode, a root-level
// source such as cli.ts counts, because it ships.
function isProductionImporter(
  layout: TestLayout,
  testOnlyRoots: ReadonlySet<string>,
  path: string,
): boolean {
  const root = getWorkspaceRoot(layout, path);

  if (testOnlyRoots.has(root) || layout.testPreloads.includes(path) || isHelperPath(layout, path)) {
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

const packageHelperPattern = /^@[^/]+\/[^/]+\/test-utils(?:\/|$)/u;

function collectSpecifierFaults(
  layout: TestLayout,
  testOnlyRoots: ReadonlySet<string>,
  importer: string,
  specifier: string,
): string[] {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const target = isRelative ? normalize(join(dirname(importer), specifier)) : specifier;
  const isHelper = isRelative ? isHelperPath(layout, target) : packageHelperPattern.test(specifier);

  if (isHelper && isProductionCode(layout, testOnlyRoots, importer)) {
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

function isProductionCode(
  layout: TestLayout,
  testOnlyRoots: ReadonlySet<string>,
  path: string,
): boolean {
  return !isRootLevelSource(layout, path) && isProductionImporter(layout, testOnlyRoots, path);
}

function isRootLevelSource(layout: TestLayout, path: string): boolean {
  return layout.isWorkspaceRepo && getWorkspaceRoot(layout, path) === '';
}
