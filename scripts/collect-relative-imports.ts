import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeStdout } from '../packages/std/src/write-stdout.ts';
import { collectImportSpecifiers } from './collect-import-specifiers.ts';

export function collectRelativeImports(source: string, filename: string): string[] | null {
  const specifiers = collectImportSpecifiers(source, filename);

  return specifiers === null
    ? null
    : [...new Set(specifiers.filter((specifier) => /^\.\.?\//u.test(specifier)))].toSorted();
}

// Bun picks steep.tsx before steep.ts and loads steep.ts for steep.js, so Bun names the file. It
// returns the path behind a symlink, so the result is the file that answers the import and leads
// there.
function resolveImportPath(specifier: string, directory: string): string {
  const named = join(directory, specifier);
  const loaded = probeFile(named) ? undefined : resolveLoadedPath(specifier, directory);

  const match =
    loaded === undefined
      ? undefined
      : readCandidatePaths(named).find((path) => probeFile(path) && realpathSync(path) === loaded);

  return match === undefined ? specifier : relative(directory, match);
}

const loadableExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

// The import steep is answered by steep.<ext>, the import steep.js also by steep.<ext>, and the
// import of a folder by its index.<ext>, each with an extension Bun loads.
function readCandidatePaths(named: string): string[] {
  const name = basename(named);

  const bases = new Set([name, name.slice(0, name.length - extname(name).length)]);

  return [
    ...readFolderEntries(dirname(named))
      .filter((entry) => isLoadableAs(entry, bases))
      .map((entry) => join(dirname(named), entry)),
    ...readFolderEntries(named)
      .filter((entry) => isLoadableAs(entry, new Set(['index'])))
      .map((entry) => join(named, entry)),
  ];
}

function isLoadableAs(entry: string, bases: ReadonlySet<string>): boolean {
  const extension = extname(entry);

  return (
    loadableExtensions.has(extension) && bases.has(entry.slice(0, entry.length - extension.length))
  );
}

function probeFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

function resolveLoadedPath(specifier: string, directory: string): string | undefined {
  try {
    return Bun.resolveSync(specifier, resolve(directory));
  } catch {
    return undefined;
  }
}

function readFolderEntries(folder: string): string[] {
  return statSync(folder, { throwIfNoEntry: false })?.isDirectory() === true
    ? readdirSync(folder).toSorted()
    : [];
}

// Prints each relative import, a tab, and the import completed to the file Bun loads for it.
if (import.meta.main) {
  const [path] = parseArgs({ args: process.argv.slice(2), allowPositionals: true }).positionals;

  if (path === undefined) {
    process.stderr.write('usage: collect-relative-imports.ts <file>\n');

    process.exitCode = 2;
  } else {
    const imports = collectRelativeImports(readFileSync(path, 'utf8'), path);

    if (imports === null) {
      process.stderr.write(`collect-relative-imports: ${path} does not parse\n`);

      process.exitCode = 1;
    } else {
      writeStdout(
        imports
          .map((specifier) => `${specifier}\t${resolveImportPath(specifier, dirname(path))}\n`)
          .join(''),
      );
    }
  }
}
