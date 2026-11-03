export interface RunToExitOptions {
  readonly cwd: string;

  // Added to the test process's environment.
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface RunToExitResult {
  readonly exitCode: number;

  readonly stdout: string;

  readonly stderr: string;
}

// Runs a command, such as the one resolveProgram gives with the test's arguments after it, to its
// exit, with stdin closed.
export async function runToExit(
  command: readonly string[],
  options: RunToExitOptions,
): Promise<RunToExitResult> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}
