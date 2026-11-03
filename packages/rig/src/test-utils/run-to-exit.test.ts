import { expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runToExit } from './run-to-exit.ts';

test('it returns the exit code, stdout and stderr of the command', async () => {
  const result = await runToExit(
    [
      process.execPath,
      '-e',
      String.raw`process.stdout.write('boil\n'); process.stderr.write('steam\n'); process.exit(3)`,
    ],
    { cwd: tmpdir() },
  );

  expect(result).toStrictEqual({ exitCode: 3, stdout: 'boil\n', stderr: 'steam\n' });
});

test('it runs in the folder it names, with the environment it adds', async () => {
  const folder = await realpath(tmpdir());

  const result = await runToExit(
    [process.execPath, '-e', "process.stdout.write(process.cwd() + ' ' + process.env.KETTLE_MODE)"],
    { cwd: folder, env: { KETTLE_MODE: 'rolling' } },
  );

  expect(result.stdout).toBe(`${folder} rolling`);
});
