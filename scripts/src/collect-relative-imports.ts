import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { writeStdout } from '../../packages/std/src/write-stdout.ts';
import { collectImportSpecifiers } from './collect-import-specifiers.ts';

export function collectRelativeImports(source: string, filename: string): string[] | null {
  const specifiers = collectImportSpecifiers(source, filename);

  return specifiers === null
    ? null
    : [...new Set(specifiers.filter((specifier) => /^\.\.?\//u.test(specifier)))].toSorted();
}

if (import.meta.main) {
  const [path] = parseArgs({ args: process.argv.slice(2), allowPositionals: true }).positionals;

  const imports =
    path === undefined ? undefined : collectRelativeImports(readFileSync(path, 'utf8'), path);

  if (imports === undefined) {
    process.stderr.write('usage: collect-relative-imports.ts <file>\n');

    process.exitCode = 2;
  } else if (imports === null) {
    process.stderr.write(`collect-relative-imports: ${path} does not parse\n`);

    process.exitCode = 1;
  } else {
    writeStdout(imports.map((specifier) => `${specifier}\n`).join(''));
  }
}
