import { toExitCode } from '../to-exit-code.ts';
import { defaultWaitMs, drainGraceMs } from './constants.ts';
import { drainStream } from './drain-stream.ts';
import { isLineMatch } from './is-line-match.ts';
import { probeGroup } from './probe-group.ts';
import { readFreePort } from './read-free-port.ts';
import { readReadyLine } from './read-ready-line.ts';
import { signalGroup } from './signal-group.ts';
import type { ProcessHandle, Signal, StartOptions, WaitForLineOptions } from './types.ts';
import { waitForGroupExit } from './wait-for-group-exit.ts';
import { waitForOutcome } from './wait-for-outcome.ts';

// Starts a program on a free port, passed as `PORT`, and waits for it to be ready. The program
// leads a process group of its own, so a signal from `stop` or the disposal reaches every process
// it forks too.
export async function start(
  command: readonly string[],
  options: StartOptions = {},
): Promise<ProcessHandle> {
  const port = options.port === undefined ? await readFreePort() : options.port;
  const name = command.join(' ');
  const args = typeof options.args === 'function' ? options.args(port) : (options.args ?? []);
  const env = typeof options.env === 'function' ? options.env(port) : options.env;

  const child = Bun.spawn([...command, ...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: { ...process.env, ...env, PORT: String(port) },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });

  const isRunning = () => child.exitCode === null && child.signalCode === null;
  const log = { all: '', stdout: '', matchedLines: 0 };

  const drained = Promise.all([
    drainStream(child.stdout, (text) => {
      log.all += text;
      log.stdout += text;
    }),
    drainStream(child.stderr, (text) => {
      log.all += text;
    }),
  ]);

  const url = `http://127.0.0.1:${port}`;
  const settleOutput = () => Promise.race([drained, Bun.sleep(drainGraceMs)]);

  const stop = async (signal: Signal = 'SIGTERM'): Promise<number> => {
    signalGroup(child.pid, signal);

    const exitCode = await child.exited;

    await waitForGroupExit(child.pid);
    await settleOutput();

    return toExitCode(exitCode, child.signalCode);
  };

  // Each match moves past the line it matched, so the next wait reads only the lines after it.
  const findNextLine = (pattern: string | RegExp): string | null => {
    const lines = log.stdout.split('\n').slice(0, -1);

    const index = lines.findIndex(
      (line, position) => position >= log.matchedLines && isLineMatch(line, pattern),
    );

    if (index === -1) {
      return null;
    }

    log.matchedLines = index + 1;

    return lines[index] ?? null;
  };

  const waitForLine = async (
    pattern: string | RegExp,
    lineOptions: WaitForLineOptions = {},
  ): Promise<string> => {
    const timeoutMs = lineOptions.timeoutMs ?? defaultWaitMs;

    const outcome = await waitForOutcome(() => findNextLine(pattern), {
      deadlineMs: timeoutMs,
      probeExited: () => !isRunning(),
      settleOutput,
    });

    if (outcome.kind === 'ready') {
      return outcome.value;
    }

    const reason =
      outcome.kind === 'exited'
        ? `exited before it printed a line that matches ${String(pattern)}`
        : `printed no line that matches ${String(pattern)} in ${timeoutMs} ms`;

    throw new Error(`${name} ${reason}; its output:\n${log.all}`);
  };

  const handle: Omit<ProcessHandle, 'readyLine'> = {
    url,
    port,
    pid: child.pid,
    write: async (text) => {
      child.stdin.write(text);

      await child.stdin.flush();
    },
    waitForLine,
    output: () => log.all,
    stop,
    [Symbol.asyncDispose]: async () => {
      if (isRunning() || probeGroup(child.pid)) {
        await stop('SIGKILL');
      }
    },
  };

  const ready = options.ready;

  if (ready === undefined) {
    return { ...handle, readyLine: null };
  }

  const readyTimeoutMs = options.readyTimeoutMs ?? defaultWaitMs;

  const outcome = await waitForOutcome(() => readReadyLine(ready, url, findNextLine), {
    deadlineMs: readyTimeoutMs,
    probeExited: () => !isRunning(),
    settleOutput,
  });

  if (outcome.kind !== 'ready') {
    const exitCode = await stop('SIGKILL');

    const reason =
      outcome.kind === 'exited'
        ? 'exited before it was ready'
        : `was not ready after ${readyTimeoutMs} ms`;

    throw new Error(`${name} ${reason} (exit code ${exitCode}); its output:\n${log.all}`);
  }

  return { ...handle, readyLine: outcome.value.line };
}
