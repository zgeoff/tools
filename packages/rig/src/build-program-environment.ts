import { join } from 'node:path';
import type { ProgramDeclaration } from './types.ts';

// The environment variable that holds a program's built artifact, such as RIG_PROGRAM_KETTLE_CLI
// for the program `kettle-cli`.
export function buildProgramVariable(name: string): string {
  return `RIG_PROGRAM_${name.toUpperCase().replaceAll('-', '_')}`;
}

export function buildProgramEnvironment(
  repoRoot: string,
  programs: Readonly<Record<string, ProgramDeclaration>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(programs).map(([name, program]) => [
      buildProgramVariable(name),
      join(repoRoot, program.package, program.artifact),
    ]),
  );
}
