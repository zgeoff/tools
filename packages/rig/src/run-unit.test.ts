import { expect, mock, test } from 'bun:test';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { defineRig } from './define-rig.ts';
import type { WorkerCount } from './read-worker-count.ts';
import type { CommandOptions } from './run-command.ts';
import { runUnit } from './run-unit.ts';

function setupTest() {
  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };
  const trackedFiles: string[] = [];
  const readWorkerCount = mock<() => Promise<WorkerCount>>();

  return {
    runCommand,
    trackedFiles,
    readWorkerCount,
    output,
    run: {
      repoRoot: '/repo',
      environment: {},
      signal: new AbortController().signal,
      runID: '4417',
    },
    deps: {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve(trackedFiles),
      runCommand,
      output,
      readWorkerCount,
    },
  };
}

test('it runs the unit tests with the worker count the host gets', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });
  ctx.trackedFiles.push('pkg/src/oven.test.ts');

  const exitCode = await runUnit(defineRig({}), [], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.runCommand.mock.calls[0]?.[0]).toContain('--parallel=3');
});

test('it says so and exits 0 when git tracks no unit test file', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });
  ctx.trackedFiles.push('pkg/src/oven.ts', 'pkg/src/oven.host.test.ts');

  const exitCode = await runUnit(defineRig({}), ['--bail'], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the unit lane has no tests\n');
  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it runs only the unit files that a path selects', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });
  ctx.trackedFiles.push('pkg/src/oven.test.ts', 'pkg/src/oven.host.test.ts');

  await runUnit(defineRig({}), ['--bail', './pkg/src/'], ctx.run, ctx.deps);

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    './pkg/src/oven.test.ts',
    '--bail',
  ]);

  expect(ctx.runCommand.mock.calls[0]?.[0]).not.toContain('./pkg/src/oven.host.test.ts');
});

test('it names the path, exits 1 and runs nothing for a unit run given only the path of a host test file', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 3 });
  ctx.trackedFiles.push('pkg/src/oven.test.ts', 'pkg/src/oven.host.test.ts');

  const exitCode = await runUnit(defineRig({}), ['./pkg/src/oven.host.test.ts'], ctx.run, ctx.deps);

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

  const exitCode = await runUnit(defineRig({}), [], ctx.run, ctx.deps);

  expect(exitCode).toBe(2);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig: TEST_WORKERS is four; set it to a whole number above 0\n',
  );

  expect(ctx.runCommand).not.toHaveBeenCalled();
});
