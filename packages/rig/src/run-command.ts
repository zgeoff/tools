import { processGroups } from './browser/process-groups.ts';
import { processRuntime } from './browser/process-runtime.ts';
import { startProcessGroup } from './browser/start-process-group.ts';

export interface CommandOptions {
  readonly cwd: string;

  readonly environment: Readonly<Record<string, string | undefined>>;

  readonly signal: AbortSignal;
}

// A command gets this long to exit after SIGTERM before its group gets SIGKILL.
const stopDeadlineMs = 10_000;

// A test can start a process of its own, such as a `sleep` or a server, that a signal to the
// command alone leaves running, so the command runs in a process group that an abort stops whole.
// An aborted run fails, whatever the command's exit code.
export async function runCommand(
  command: readonly string[],
  options: CommandOptions,
): Promise<number> {
  const group = startProcessGroup(command, {
    cwd: options.cwd,
    environment: options.environment,
    signal: options.signal,
    stdout: 'inherit',
    stopDeadlineMs,
    groups: processGroups,
    runtime: processRuntime,
  });

  const exitCode = await group.exited;

  return options.signal.aborted ? 1 : exitCode;
}
