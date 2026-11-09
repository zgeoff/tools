import { expect, test } from 'bun:test';
import { runCheckedCommand } from './run-checked-command.ts';
import { runCommand } from './run-command.ts';

test('it throws a command error that names the command for a checked command that fails', () => {
  const running = runCheckedCommand(runCommand, ['sh', '-c', 'echo cold >&2; exit 1'], {
    cwd: import.meta.dir,
    env: { PATH: process.env['PATH'] },
  });

  expect(running).rejects.toThrow('sh -c echo cold >&2; exit 1 exited with 1: cold');
});

test('it returns the result of a checked command that passes', async () => {
  const result = await runCheckedCommand(runCommand, ['echo', 'boiled'], {
    cwd: import.meta.dir,
    env: { PATH: process.env['PATH'] },
  });

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'boiled\n', stderr: '' });
});
