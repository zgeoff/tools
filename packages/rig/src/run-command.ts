export interface CommandOptions {
  readonly cwd: string;

  readonly environment: Readonly<Record<string, string | undefined>>;

  readonly signal: AbortSignal;
}

// An abort sends SIGTERM to the command, which diet passes on to the process it caps. An aborted
// run fails, whatever the command's exit code.
export async function runCommand(
  command: readonly string[],
  options: CommandOptions,
): Promise<number> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.environment,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const handleAbort = () => {
    child.kill('SIGTERM');
  };

  options.signal.addEventListener('abort', handleAbort, { once: true });

  if (options.signal.aborted) {
    handleAbort();
  }

  try {
    const exitCode = await child.exited;

    return options.signal.aborted ? 1 : exitCode;
  } finally {
    options.signal.removeEventListener('abort', handleAbort);
  }
}
