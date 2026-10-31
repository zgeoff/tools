import { $ } from 'bun';
import type { GitEnv } from './read-git-env.ts';

export interface ChexCLIRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;

  // The last line chex prints, which names the last check it ran as cleared or bounced.
  readonly lastLine: string | undefined;
}

// Runs the bin of a packed chex in the folder, as `bun x chex <args>` runs it in a repo.
export async function runChexCLI(
  binPath: string,
  cwd: string,
  env: GitEnv,
  args: readonly string[],
): Promise<ChexCLIRun> {
  const result = await $`bun ${binPath} ${args}`
    .cwd(cwd)
    .env({ ...env })
    .nothrow()
    .quiet();

  const stdout = result.stdout.toString();

  return {
    exitCode: result.exitCode,
    stdout,
    stderr: result.stderr.toString(),
    lastLine: stdout.trimEnd().split('\n').at(-1),
  };
}
