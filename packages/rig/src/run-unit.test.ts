import { expect, mock, test } from 'bun:test';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { defineRig } from './define-rig.ts';
import type { WorkerCount } from './read-worker-count.ts';
import type { CommandOptions } from './run-command.ts';
import { runUnit } from './run-unit.ts';

function setupTest(workers: WorkerCount) {
  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return {
    runCommand,
    output,
    run: {
      repoRoot: '/repo',
      environment: {},
      signal: new AbortController().signal,
      runID: '4417',
    },
    deps: {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      runCommand,
      output,
      readWorkerCount: () => Promise.resolve(workers),
    },
  };
}

test('it runs the unit tests with the worker count the host gets', async () => {
  const ctx = setupTest({ kind: 'count', count: 3 });

  const exitCode = await runUnit(defineRig({}), [], ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.runCommand.mock.calls[0]?.[0]).toContain('--parallel=3');
});

test('it exits 2 with the reason and runs no test for a worker count it refuses', async () => {
  const ctx = setupTest({
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
