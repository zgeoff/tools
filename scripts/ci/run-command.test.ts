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
