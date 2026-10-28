export interface CommandOptions {
  readonly cwd: string;

  // The whole environment of the command; it inherits nothing from this process.
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly stdin?: string;

  // Aborting it stops the command, whose result then holds the exit code of the stop.
  readonly signal?: AbortSignal;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type RunCommand = (
  argv: readonly string[],
  options: Readonly<CommandOptions>,
) => Promise<CommandResult>;

// Runs the command with its output captured, and returns whatever its exit code.
export async function runCommand(
  argv: readonly string[],
  options: Readonly<CommandOptions>,
): Promise<CommandResult> {
  const child = Bun.spawn([...argv], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: options.stdin === undefined ? 'ignore' : Buffer.from(options.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, stdout, stderr };
}
