import { expect, mock, test } from 'bun:test';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { defineRig } from './define-rig.ts';
import type { WorkerCount } from './read-worker-count.ts';
import type { CommandOptions } from './run-command.ts';
import { runUnit } from './run-unit.ts';

function setupTest() {
  const signal = new AbortController().signal;

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };
  const readWorkerCount = mock<() => Promise<WorkerCount>>();

  return { signal, runCommand, readWorkerCount, output };
}

test('it runs the unit tests with the worker count the host gets', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });

  const exitCode = await runUnit(
    defineRig({}),
    [],
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve(['pkg/src/oven.test.ts']),
      runCommand: ctx.runCommand,
      output: ctx.output,
      readWorkerCount: ctx.readWorkerCount,
    },
  );

  expect(exitCode).toBe(0);
  expect(ctx.runCommand.mock.calls[0]?.[0]).toContain('--parallel=3');
});

test('it says so and exits 0 when git tracks no unit test file', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });

  const exitCode = await runUnit(
    defineRig({}),
    ['--bail'],
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve(['pkg/src/oven.ts', 'pkg/src/oven.host.test.ts']),
      runCommand: ctx.runCommand,
      output: ctx.output,
      readWorkerCount: ctx.readWorkerCount,
    },
  );

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the unit lane has no tests\n');
  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it runs only the unit files that a path selects', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });

  await runUnit(
    defineRig({}),
    ['--bail', './pkg/src/'],
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () =>
        Promise.resolve(['pkg/src/oven.test.ts', 'pkg/src/oven.host.test.ts']),
      runCommand: ctx.runCommand,
      output: ctx.output,
      readWorkerCount: ctx.readWorkerCount,
    },
  );

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    './pkg/src/oven.test.ts',
    '--bail',
  ]);

  expect(ctx.runCommand.mock.calls[0]?.[0]).not.toContain('./pkg/src/oven.host.test.ts');
});

test('it names the path, exits 1 and runs nothing for a unit run given only the path of a host test file', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });

  const exitCode = await runUnit(
    defineRig({}),
    ['./pkg/src/oven.host.test.ts'],
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () =>
        Promise.resolve(['pkg/src/oven.test.ts', 'pkg/src/oven.host.test.ts']),
      runCommand: ctx.runCommand,
      output: ctx.output,
      readWorkerCount: ctx.readWorkerCount,
    },
  );

  expect(exitCode).toBe(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig: the unit lane has no tests that match ./pkg/src/oven.host.test.ts\n',
  );

  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it exits 2 with the reason and runs no test for a worker count it refuses', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({
    kind: 'invalid',
    message: 'TEST_WORKERS is four; set it to a whole number above 0',
  });

  const exitCode = await runUnit(
    defineRig({}),
    [],
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve(['pkg/src/oven.test.ts']),
      runCommand: ctx.runCommand,
      output: ctx.output,
      readWorkerCount: ctx.readWorkerCount,
    },
  );

  expect(exitCode).toBe(2);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig: TEST_WORKERS is four; set it to a whole number above 0\n',
  );

  expect(ctx.runCommand).not.toHaveBeenCalled();
});
