import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { runProgram } from './run-program.ts';

function setupTest() {
  const tiny = join(import.meta.dir, '../test-utils/run-tiny-program.ts');
  const previous = process.env['RIG_PROGRAM_TINY'];

  process.env['RIG_PROGRAM_TINY'] = tiny;

  onTestFinished(() => {
    if (previous === undefined) {
      delete process.env['RIG_PROGRAM_TINY'];
    } else {
      process.env['RIG_PROGRAM_TINY'] = previous;
    }
  });

  return { tiny };
}

test('it runs the program to its exit and returns what it printed', async () => {
  setupTest();

  const result = await runProgram('tiny', { args: ['echo', 'boil', 'err:steam'] });

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'boil\n', stderr: 'steam\n' });
});

test('it returns the exit code of a program that fails', async () => {
  setupTest();

  const result = await runProgram('tiny', { args: ['exit', '7'] });

  expect(result.exitCode).toBe(7);
});

test('it adds the environment the caller names', async () => {
  setupTest();

  const result = await runProgram('tiny', {
    args: ['env', 'KETTLE_MODE'],
    env: { KETTLE_MODE: 'rolling' },
  });

  expect(result.stdout).toBe('rolling\n');
});

test('it runs the program in the folder the caller names', async () => {
  const ctx = setupTest();

  const result = await runProgram('tiny', { args: ['echo'], cwd: join(ctx.tiny, '..') });

  expect(result.exitCode).toBe(0);
});
