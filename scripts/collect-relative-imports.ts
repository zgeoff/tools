import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeStdout } from '../packages/std/src/write-stdout.ts';
import { collectImportSpecifiers } from './collect-import-specifiers.ts';

export function collectRelativeImports(source: string, filename: string): string[] | null {
  const specifiers = collectImportSpecifiers(source, filename);

  return specifiers === null
    ? null
    : [...new Set(specifiers.filter((specifier) => /^\.\.?\//u.test(specifier)))].toSorted();
}

// Bun picks among files that differ only in their extension in its own order, such as .tsx before
// .ts, so the file it loads comes from Bun itself. Bun returns the path behind a symlink, so only
// the file name it picked is kept. An import no file answers stays as written.
function resolveImportPath(specifier: string, directory: string): string {
  const name = basename(specifier);
  const loaded = findLoadedName(specifier, directory);

  if (loaded === undefined || loaded === name) {
    return specifier;
  }

  return loaded.startsWith(`${name}.`)
    ? `${specifier}${loaded.slice(name.length)}`
    : `${specifier}/${loaded}`;
}

function findLoadedName(specifier: string, directory: string): string | undefined {
  try {
    return basename(Bun.resolveSync(specifier, resolve(directory)));
  } catch {
    return undefined;
  }
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
