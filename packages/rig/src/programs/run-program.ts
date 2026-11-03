import { readLaunchSources, resolveProgramLaunch } from './resolve-program-launch.ts';

export interface RunProgramOptions {
  readonly args?: readonly string[];

  readonly env?: Readonly<Record<string, string>>;

  readonly cwd?: string;
}

export interface ProgramResult {
  readonly exitCode: number;

  readonly stdout: string;

  readonly stderr: string;
}

// Runs a program that rig.config.ts declares to its exit.
export async function runProgram(
  name: string,
  options: RunProgramOptions = {},
): Promise<ProgramResult> {
  const launch = await resolveProgramLaunch(name, readLaunchSources());

  const child = Bun.spawn([...launch.command, ...(options.args ?? [])], {
    cwd: options.cwd ?? launch.cwd,
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
