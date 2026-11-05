import type { ProcessRuntime, SpawnOptions } from './browser/process-runtime.ts';

export interface CommandOutput {
  readonly exitCode: number;

  readonly stdout: string;
}

export type ReadCommandOptions = Omit<SpawnOptions, 'stdout'>;

export type ReadCommandOutput = (
  command: readonly string[],
  options: ReadCommandOptions,
) => Promise<CommandOutput>;

// The command's stderr goes to rig's own, so a failure prints git's reason.
export async function readCommandOutput(
  command: readonly string[],
  options: ReadCommandOptions,
  runtime: Pick<ProcessRuntime, 'spawn'>,
): Promise<CommandOutput> {
  const listing = runtime.spawn(command, { ...options, stdout: 'pipe' });

  const [exitCode, stdout] = await Promise.all([
    listing.exited,
    new Response(listing.stdout).text(),
  ]);

  return { exitCode, stdout };
}
