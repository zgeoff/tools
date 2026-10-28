import { expect, test } from 'bun:test';
import { runCommand } from './run-command.ts';

test('it returns the exit code and the captured output of the command', async () => {
  const result = await runCommand(['sh', '-c', 'echo boiled; echo steam >&2; exit 3'], {
    cwd: import.meta.dir,
    env: { PATH: process.env['PATH'] },
  });

  expect(result).toStrictEqual({ exitCode: 3, stdout: 'boiled\n', stderr: 'steam\n' });
});

test('it hands the command its stdin and only the given environment', async () => {
  const result = await runCommand(['sh', '-c', 'cat; printf "%s" "$KETTLE$HOME"'], {
    cwd: import.meta.dir,
    env: { PATH: process.env['PATH'], KETTLE: 'copper' },
    stdin: 'water\n',
  });

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'water\ncopper', stderr: '' });
});

test('it stops the command when its signal aborts, and returns the exit code of the stop', async () => {
  const stopping = new AbortController();

  const running = runCommand(['sh', '-c', 'echo boiling; exec sleep 30'], {
    cwd: import.meta.dir,
    env: { PATH: process.env['PATH'] },
    signal: stopping.signal,
  });

  stopping.abort();

  const result = await running;

  expect(result.exitCode).toBe(143);
});
