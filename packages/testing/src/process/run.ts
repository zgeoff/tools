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

  // The wait covers the output pipes too, which a descendant can hold open past the exit.
  const finished = (async () => {
    await child.exited;
    await drained;

    return true;
  })();

  const timeoutMs = options.timeoutMs;

  const hasFinished =
    timeoutMs === undefined ? await finished : await raceTimeout(finished, timeoutMs);

  if (!hasFinished) {
    // The leader may be gone while a descendant of its group still runs.
    signalGroup(child.pid, 'SIGKILL');

    await child.exited;
    await waitForGroupExit(child.pid);

    await Promise.race([drained, Bun.sleep(drainGraceMs)]);

    throw new Error(
      `${command.join(' ')} did not exit in ${timeoutMs} ms; its output:\n${log.stdout}${log.stderr}`,
    );
  }

  const exitCode = await child.exited;

  return { exitCode: toExitCode(exitCode, child.signalCode), ...log };
}

// Resolves with the promise's value, or with false once timeoutMs passes. A timer that nothing
// cancelled would keep the test process's event loop busy until it fired.
async function raceTimeout(finished: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });

  try {
    return await Promise.race([finished, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
