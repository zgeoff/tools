import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissingProgramError } from './missing-program-error.ts';
import { runProgram } from './run-program.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-program-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it returns the exit code and the output of a program on the PATH', async () => {
  const ctx = await setupTest();

  const result = runProgram('demo', { cwd: ctx.directory, env: process.env }, [
    'sh',
    '-c',
    'echo out; echo err >&2; exit 3',
  ]);

  expect(result).toStrictEqual({ exitCode: 3, stdout: 'out\n', stderr: 'err\n' });
});

test('it throws MissingProgramError when the PATH lacks the program', async () => {
  const ctx = await setupTest();

  expect(() =>
    runProgram('demo', { cwd: ctx.directory, env: { PATH: ctx.directory } }, [
      'shellcheck',
      '--version',
    ]),
  ).toThrowWithMessage(
    MissingProgramError,
    'demo: shellcheck is not on the PATH, and the demo check needs it. Install shellcheck, then run zgeoff-check again.',
  );
});
