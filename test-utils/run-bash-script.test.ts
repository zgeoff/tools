import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBashScript } from './run-bash-script.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-bash-script-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const stubDirectory = join(directory, 'bin');

  await mkdir(stubDirectory);

  return { directory, stubDirectory };
}

test('it passes the arguments to the script and returns its stdout', async () => {
  const ctx = await setupTest();

  const script = join(ctx.directory, 'echo.sh');

  await writeFile(script, 'echo "$1|$2"\n');

  const result = await runBashScript({
    script,
    args: ['kettle', 'two words'],
    stubDirectory: ctx.stubDirectory,
    env: {},
  });

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'kettle|two words\n', stderr: '' });
});

test('it returns the exit code and stderr of a failed script without throwing', async () => {
  const ctx = await setupTest();

  const script = join(ctx.directory, 'fail.sh');

  await writeFile(script, 'echo "no kettle" >&2\nexit 3\n');

  const result = await runBashScript({
    script,
    args: [],
    stubDirectory: ctx.stubDirectory,
    env: {},
  });

  expect(result).toStrictEqual({ exitCode: 3, stdout: '', stderr: 'no kettle\n' });
});

test('it runs a command from the stub directory before one on PATH', async () => {
  const ctx = await setupTest();

  const script = join(ctx.directory, 'which.sh');
  const stub = join(ctx.stubDirectory, 'date');

  await writeFile(script, 'date\n');
  await writeFile(stub, '#!/bin/sh\necho stub date\n');
  await chmod(stub, 0o755);

  const result = await runBashScript({
    script,
    args: [],
    stubDirectory: ctx.stubDirectory,
    env: {},
  });

  expect(result.stdout).toBe('stub date\n');
});

test("it gives the script the caller's env", async () => {
  const ctx = await setupTest();

  const script = join(ctx.directory, 'env.sh');

  await writeFile(script, 'echo "$KETTLE_STATE"\n');

  const result = await runBashScript({
    script,
    args: [],
    stubDirectory: ctx.stubDirectory,
    env: { KETTLE_STATE: 'boiled' },
  });

  expect(result.stdout).toBe('boiled\n');
});
