import { readFileSync } from 'node:fs';
import { writeStdout } from '../packages/std/src/write-stdout.ts';
import { collectImportSpecifiers } from './collect-import-specifiers.ts';

export function collectPackageImports(source: string, filename: string): string[] | null {
  const specifiers = collectImportSpecifiers(source, filename);

  if (specifiers === null) {
    return null;
  }

  const packages = specifiers
    .filter((specifier) => !/^(?:\.|\/|node:|bun:|bun$)/u.test(specifier))
    .map(
      (specifier) =>
        /^(?<name>@[^/]+\/[^/]+|[^/]+)/u.exec(specifier)?.groups?.['name'] ?? specifier,
    );

  return [...new Set(packages)].toSorted();
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
