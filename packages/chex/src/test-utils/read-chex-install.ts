import { dirname } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';

export interface ChexInstall {
  // The folder that holds chex's package.json, as an install leaves it in node_modules.
  readonly packageDir: string;

  readonly binPath: string;
}

// The `chex` program's command ends with its bin, `src/cli.ts`: the packed one under `rig e2e`, and
// the source one under a plain `bun test`. Two folders up is the package either way.
export async function readChexInstall(): Promise<ChexInstall> {
  const chex = await resolveProgram('chex');

  const binPath = chex.command.at(-1);

  if (binPath === undefined || !binPath.endsWith('/src/cli.ts')) {
    throw new Error(
      `the chex program runs ${chex.command.join(' ')}, which ends with no src/cli.ts`,
    );
  }

  return { packageDir: dirname(dirname(binPath)), binPath };
}
