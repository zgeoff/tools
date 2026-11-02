import { dirname, join, normalize } from 'node:path';

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

// Bun's scanner leaves out a type-only import, which still ties the importer to the helper, so each
// `type` keyword of an import or export goes before the scan.
const typeImportPattern = /\bimport\s+type\s+(?=[{*]|[\w$]+\s+from\b)/gu;
const typeExportPattern = /\bexport\s+type\s+(?=[{*])/gu;
const inlineTypePattern = /(?<opener>[{,]\s*)type\s+(?=[\w$]+\s*(?:[,}]|\bas\b))/gu;

// Bun's scanner throws on a script's shebang line, which Bun's runtime skips.
const shebangPattern = /^#!.*/u;

function collectRelativeImports(source: SourceFile): string[] {
  const transpiler = new Bun.Transpiler({ loader: pickLoader(source.path) });

  const text = source.text
    .replace(shebangPattern, '')
    .replaceAll(typeImportPattern, 'import ')
    .replaceAll(typeExportPattern, 'export ')
    .replaceAll(inlineTypePattern, '$<opener>');

  return transpiler
    .scanImports(text)
    .map((entry) => entry.path)
    .filter((path) => path.startsWith('./') || path.startsWith('../'));
}

function pickLoader(path: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }

  if (path.endsWith('.jsx')) {
    return 'jsx';
  }

  return /\.[cm]?ts$/u.test(path) ? 'ts' : 'js';
}

function isForeignHelper(importer: string, target: string): boolean {
  const targetRoot = getWorkspaceRoot(target);
  const helperPrefix = targetRoot === '' ? 'test-utils/' : `${targetRoot}/test-utils/`;

  return target.startsWith(helperPrefix) && targetRoot !== getWorkspaceRoot(importer);
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
