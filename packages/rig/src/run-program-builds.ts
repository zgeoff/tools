import { join } from 'node:path';
import type { CommandOptions } from './run-command.ts';
import type { ProgramDeclaration, RigOutput, RigRun } from './types.ts';

export interface ProgramBuildDeps {
  readonly output: RigOutput;

  readonly runCommand: (command: readonly string[], options: CommandOptions) => Promise<number>;
}

// Builds each program once, in its package folder, and stops at the first failure. The build's own
// output goes to the terminal as it runs.
export async function runProgramBuilds(
  programs: Readonly<Record<string, ProgramDeclaration>>,
  run: RigRun,
  deps: ProgramBuildDeps,
): Promise<number> {
  for (const [name, program] of Object.entries(programs)) {
    const exitCode = await deps.runCommand(['bash', '-c', program.build], {
      cwd: join(run.repoRoot, program.package),
      environment: run.environment,
      signal: run.signal,
    });

    if (exitCode !== 0) {
      deps.output.err(
        `rig: the build of program "${name}" failed with exit code ${exitCode}: ${program.build}\n`,
      );

      return exitCode;
    }
  }

  return 0;
}
