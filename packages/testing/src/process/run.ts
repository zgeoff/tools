import { toExitCode } from '../to-exit-code.ts';
import { drainGraceMs } from './constants.ts';
import { drainStream } from './drain-stream.ts';
import { signalGroup } from './signal-group.ts';
import type { RunOptions, RunResult } from './types.ts';
import { waitForGroupExit } from './wait-for-group-exit.ts';

// Runs a program to its exit. The program leads a process group of its own, so a time limit stops
// every process it forks too.
export async function run(
  command: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const child = Bun.spawn([...command, ...(options.args ?? [])], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: { ...process.env, ...options.env },
    stdin: options.input === undefined ? 'ignore' : new Blob([options.input]),
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });

  const log = { stdout: '', stderr: '' };

  const drained = Promise.all([
    drainStream(child.stdout, (text) => {
      log.stdout += text;
    }),
    drainStream(child.stderr, (text) => {
      log.stderr += text;
    }),
  ]);

  const timeoutMs = options.timeoutMs;

  const hasFinished =
    timeoutMs === undefined
      ? await child.exited.then(() => true)
      : await Promise.race([child.exited.then(() => true), Bun.sleep(timeoutMs).then(() => false)]);

  if (!hasFinished) {
    signalGroup(child.pid, 'SIGKILL');

    await child.exited;
    await waitForGroupExit(child.pid);

    await Promise.race([drained, Bun.sleep(drainGraceMs)]);

    throw new Error(
      `${command.join(' ')} did not exit in ${timeoutMs} ms; its output:\n${log.stdout}${log.stderr}`,
    );
  }

  await drained;

  const exitCode = await child.exited;

  return { exitCode: toExitCode(exitCode, child.signalCode), ...log };
}
