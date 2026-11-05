export interface CommandOutput {
  readonly exitCode: number;

  readonly stdout: string;
}

export type ReadCommandOutput = (command: readonly string[], cwd: string) => Promise<CommandOutput>;

// The command's stderr goes to rig's own, so a failure prints git's reason.
export async function readCommandOutput(
  command: readonly string[],
  cwd: string,
): Promise<CommandOutput> {
  const listing = Bun.spawn([...command], { cwd, stdout: 'pipe', stderr: 'inherit' });

  const [exitCode, stdout] = await Promise.all([
    listing.exited,
    new Response(listing.stdout).text(),
  ]);

  return { exitCode, stdout };
}
