import { createServer } from 'node:net';
import { constants } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { readLaunchSources, resolveProgramLaunch } from './resolve-program-launch.ts';

export type ProgramSignal = 'SIGTERM' | 'SIGINT' | 'SIGKILL';

export type ProgramReady = { readonly url: string } | { readonly stdout: string | RegExp };

export interface StartProgramOptions {
  readonly args?: readonly string[];

  readonly env?: Readonly<Record<string, string | undefined>>;

  readonly ready?: ProgramReady;
}

export interface ProgramHandle extends AsyncDisposable {
  // The `http://127.0.0.1:<port>` base the program listens on.
  readonly url: string;

  readonly port: number;

  // Sends the signal, waits for the exit and returns the exit code, which is 128 plus the signal's
  // number when the signal killed the program.
  readonly stop: (signal?: ProgramSignal) => Promise<number>;

  // The stdout and stderr so far.
  readonly output: () => string;
}

const readyDeadlineMs = 10_000;

// Starts a program that rig.config.ts declares on a free port, passed as `PORT`, and waits for it
// to be ready.
export async function startProgram(
  name: string,
  options: StartProgramOptions = {},
): Promise<ProgramHandle> {
  const launch = await resolveProgramLaunch(name, readLaunchSources());
  const port = await readFreePort();

  const child = Bun.spawn([...launch.command, ...(options.args ?? [])], {
    cwd: launch.cwd,
    env: { ...process.env, ...options.env, PORT: String(port) },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const log = { all: '', stdout: '' };

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

  const stop = async (signal: ProgramSignal = 'SIGTERM'): Promise<number> => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }

    const exitCode = await child.exited;

    await drained;

    return child.signalCode === null ? exitCode : 128 + toSignalNumber(child.signalCode);
  };

  const handle: ProgramHandle = {
    url,
    port,
    stop,
    output: () => log.all,
    [Symbol.asyncDispose]: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        await stop('SIGKILL');
      }
    },
  };

  if (options.ready === undefined) {
    return handle;
  }

  const outcome = await waitForReady(options.ready, url, {
    readStdout: () => log.stdout,
    probeExited: () => child.exitCode !== null || child.signalCode !== null,
  });

  if (outcome !== 'ready') {
    const exitCode = await stop('SIGKILL');

    const reason =
      outcome === 'exited'
        ? `exited before it was ready`
        : `was not ready after ${readyDeadlineMs / 1000} s`;

    throw new Error(`program ${name} ${reason} (exit code ${exitCode}); its output:\n${log.all}`);
  }

  return handle;
}

function readFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      server.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('the OS gave no port'));
        }
      });
    });
  });
}

async function drainStream(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();

  for await (const chunk of stream) {
    onText(decoder.decode(chunk, { stream: true }));
  }
}

function toSignalNumber(signal: number | NodeJS.Signals): number {
  return typeof signal === 'number' ? signal : constants.signals[signal];
}

interface ReadyProbes {
  readonly readStdout: () => string;

  readonly probeExited: () => boolean;
}

const pollIntervalMs = 50;

async function waitForReady(
  ready: ProgramReady,
  baseURL: string,
  probes: ReadyProbes,
): Promise<'ready' | 'exited' | 'timeout'> {
  const deadline = Date.now() + readyDeadlineMs;

  while (Date.now() < deadline) {
    const isReady = await probeReady(ready, baseURL, probes.readStdout());

    if (isReady) {
      return 'ready';
    }

    if (probes.probeExited()) {
      return 'exited';
    }

    await sleep(pollIntervalMs);
  }

  return 'timeout';
}

async function probeReady(ready: ProgramReady, baseURL: string, stdout: string): Promise<boolean> {
  if ('stdout' in ready) {
    const expected = ready.stdout;

    return stdout
      .split('\n')
      .some((line) =>
        typeof expected === 'string' ? line.includes(expected) : expected.test(line),
      );
  }

  try {
    const response = await fetch(new URL(ready.url, baseURL), {
      signal: AbortSignal.timeout(1000),
    });

    return response.ok;
  } catch {
    return false;
  }
}
