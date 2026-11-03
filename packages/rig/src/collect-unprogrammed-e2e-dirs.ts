import { posix } from 'node:path';
import type { ProgramDeclaration } from './types.ts';

// An e2e folder runs a program of its package, so a folder in a package that no program names has
// nothing to run.
export function collectUnprogrammedE2EDirs(
  e2eDirs: readonly string[],
  programs: Readonly<Record<string, ProgramDeclaration>>,
): readonly string[] {
  const packages = new Set(
    Object.values(programs).map((program) => toPackageFolder(program.package)),
  );

  return e2eDirs.filter((directory) => !packages.has(toPackageFolder(posix.dirname(directory))));
}

function toPackageFolder(path: string): string {
  const normalized = posix.normalize(path).replace(/\/$/u, '');

  return normalized === '.' ? '' : normalized;
}
