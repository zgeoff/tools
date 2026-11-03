import { onTestFinished } from 'bun:test';
import { spawn } from 'bun-pty';
import { toExitCode } from '../to-exit-code.ts';
import { buildScreen } from './build-screen.ts';
import { buildUser } from './build-user.ts';
import type { SpawnCLIOptions, SpawnedCLI } from './types.ts';

// Runs a program in a pseudo-terminal, as a person's terminal would, and gives the test its screen
// and keyboard. A test that spawns a program kills it when the test ends.
export function spawnCLI(
  command: readonly string[],
  options: SpawnCLIOptions = {},
): Promise<SpawnedCLI> {
  const [file, ...commandArgs] = command;

  if (file === undefined) {
    return Promise.reject(new Error('spawnCLI needs a command with at least a program to run'));
  }

  const pty = spawn(file, [...commandArgs, ...(options.args ?? [])], {
    name: 'xterm-256color',
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: { ...readDefinedEnv(process.env), TERM: 'xterm-256color', ...options.env },
  });

  const isSilent = options.silent ?? true;
  const output = { text: '' };
  const exit: { code: number | null } = { code: null };

  pty.onData((chunk) => {
    output.text += chunk;

    if (!isSilent) {
      process.stdout.write(chunk);
    }
  });

  const exited = Promise.withResolvers<number>();
  const result = exited.promise;

  pty.onExit((event) => {
    exit.code = toExitCode(event.exitCode, event.signal);

    exited.resolve(exit.code);
  });

  const kill = (signal: NodeJS.Signals = 'SIGTERM'): void => {
    if (exit.code === null) {
      pty.kill(signal);
    }
  };

  const stopAndWait = async (): Promise<void> => {
    kill('SIGKILL');

    await result;
  };

  onTestFinished(stopAndWait);

  return Promise.resolve({
    screen: buildScreen(() => output.text),
    user: buildUser((text) => {
      pty.write(text);
    }),
    resize: (cols, rows) => {
      pty.resize(cols, rows);
    },
    result,
    exitCode: () => exit.code,
    kill,
    [Symbol.asyncDispose]: stopAndWait,
  });
}

function readDefinedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  );
}
