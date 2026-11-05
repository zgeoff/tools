import { readFileSync } from 'node:fs';
import { writeStdout } from '../packages/std/src/write-stdout.ts';
import { collectImportSpecifiers } from './collect-import-specifiers.ts';

export function collectRelativeImports(source: string, filename: string): string[] | null {
  const specifiers = collectImportSpecifiers(source, filename);

  return specifiers === null
    ? null
    : [...new Set(specifiers.filter((specifier) => /^\.\.?\//u.test(specifier)))].toSorted();
}

if (import.meta.main) {
  const path = process.argv[2] ?? '';
  const imports = collectRelativeImports(readFileSync(path, 'utf8'), path);

  if (imports === null) {
    process.stderr.write(`collect-relative-imports: ${path} does not parse\n`);

    process.exitCode = 1;
  } else {
    writeStdout(imports.map((specifier) => `${specifier}\n`).join(''));
  }
}
