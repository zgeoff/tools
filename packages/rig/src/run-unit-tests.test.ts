import { expect, mock, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import type { CommandOptions } from './run-command.ts';
import { runUnitTests } from './run-unit-tests.ts';

function setupTest() {
  const signal = new AbortController().signal;

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  return {
    signal,
    runCommand,
    run: { repoRoot: '/repo', environment: { PATH: '/usr/bin' }, signal, runID: '4417' },
    deps: { dietScript: '/diet.sh', runCommand },
  };
}

test('it runs the unit command under diet in the repo and returns its exit code', async () => {
  const ctx = setupTest();

  ctx.runCommand.mockResolvedValue(4);

  const exitCode = await runUnitTests(
    defineRig({}),
    { workerCount: 2, extraArgs: ['./src/a.test.ts'] },
    ctx.run,
    ctx.deps,
  );

  expect(exitCode).toBe(4);
  expect(ctx.runCommand).toHaveBeenCalledTimes(1);

  expect(ctx.runCommand.mock.calls[0]?.[0].slice(0, 6)).toStrictEqual([
    'bash',
    '/diet.sh',
    '--',
    'bun',
    'test',
    '--parallel=2',
  ]);

  expect(ctx.runCommand.mock.calls[0]?.[0].at(-1)).toBe('./src/a.test.ts');

  expect(ctx.runCommand.mock.calls[0]?.[1]).toStrictEqual({
    cwd: '/repo',
    environment: { PATH: '/usr/bin' },
    signal: ctx.signal,
  });
});

test('it gives diet the memory that the config declares for the unit lane', async () => {
  const ctx = setupTest();

  await runUnitTests(
    defineRig({ lanes: { unit: { memory: '4G' } } }),
    { workerCount: 1, extraArgs: [] },
    ctx.run,
    ctx.deps,
  );

  expect(ctx.runCommand.mock.calls[0]?.[0].slice(0, 5)).toStrictEqual([
    'bash',
    '/diet.sh',
    '--budget',
    '4G',
    '--',
  ]);
});
