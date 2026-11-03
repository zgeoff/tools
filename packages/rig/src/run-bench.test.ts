import { expect, mock, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { runBench } from './run-bench.ts';
import type { CommandOptions } from './run-command.ts';
import { makeRecordingStub } from './test-utils/make-recording-stub.ts';

function setupTest(exitCodes: readonly number[] = []) {
  const signal = new AbortController().signal;

  const codes = [...exitCodes];

  const startKiln = mock<() => Promise<unknown>>(() =>
    Promise.resolve({ environment: { KILN_URL: 'http://localhost:7001' } }),
  );

  const stopKiln = mock<() => Promise<unknown>>(() => Promise.resolve());

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(codes.shift() ?? 0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return {
    runCommand,
    output,
    startKiln,
    stopKiln,
    run: { repoRoot: '/repo', environment: { PATH: '/bin' }, signal, runID: '1' },
    deps: {
      dietScript: '/diet.sh',
      benchScript: '/run-bench-file.ts',
      output,
      runCommand,
      probeWorkspaceRepo: () => Promise.resolve(true),
      readTrackedFiles: () =>
        Promise.resolve([
          'packages/kettle/package.json',
          'packages/kettle/bench/boil.bench.ts',
          'packages/kettle/bench/steep.bench.ts',
        ]),
      importModule: (path: string) =>
        Promise.resolve({ default: path.endsWith('start-kiln.ts') ? startKiln : stopKiln }),
    },
  };
}

test('it runs each bench file in a process of its own under diet', async () => {
  const ctx = setupTest();

  const exitCode = await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(0);

  expect(ctx.runCommand.mock.calls.map((call) => call[0])).toStrictEqual([
    [
      'bash',
      '/diet.sh',
      '--',
      'bun',
      '/run-bench-file.ts',
      '/repo/packages/kettle/bench/boil.bench.ts',
    ],
    [
      'bash',
      '/diet.sh',
      '--',
      'bun',
      '/run-bench-file.ts',
      '/repo/packages/kettle/bench/steep.bench.ts',
    ],
  ]);
});

test('it runs every file and exits 1 when one benchmark is over its budget', async () => {
  const ctx = setupTest([1, 0]);

  const exitCode = await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
  expect(ctx.runCommand).toHaveBeenCalledTimes(2);
});

test('it runs only the benchmark that the name picks', async () => {
  const ctx = setupTest();

  await runBench(['steep'], defineRig({}), ctx.run, ctx.deps);

  expect(ctx.runCommand).toHaveBeenCalledTimes(1);

  expect(ctx.runCommand.mock.calls[0]?.[0].at(-1)).toBe(
    '/repo/packages/kettle/bench/steep.bench.ts',
  );
});

test('it exits 1 and names the benchmarks when the name matches none', async () => {
  const ctx = setupTest();

  const exitCode = await runBench(['brew'], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig bench: no benchmark named "brew"; the benchmarks are boil, steep\n',
  );
});

test('it says so and exits 0 when the repo has no benchmark', async () => {
  const ctx = setupTest();

  const exitCode = await runBench([], defineRig({}), ctx.run, {
    ...ctx.deps,
    readTrackedFiles: () => Promise.resolve([]),
  });

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the repo has no benchmarks\n');
});

test('it runs the start hook of the bench lane first, hands its environment on, and runs the stop hook after', async () => {
  const ctx = setupTest();

  const config = defineRig({
    lanes: {
      kiln: { limit: '15s', start: 'test-utils/start-kiln.ts', stop: 'test-utils/stop-kiln.ts' },
    },
    bench: { lane: 'kiln' },
  });

  const exitCode = await runBench([], config, ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.startKiln).toHaveBeenCalledTimes(1);
  expect(ctx.stopKiln).toHaveBeenCalledTimes(1);

  expect(ctx.runCommand.mock.calls[0]?.[1].environment).toStrictEqual({
    PATH: '/bin',
    KILN_URL: 'http://localhost:7001',
  });
});

test('it runs the stop hook of the bench lane even when a benchmark fails', async () => {
  const ctx = setupTest([1, 1]);

  const config = defineRig({
    lanes: { kiln: { limit: '15s', stop: 'test-utils/stop-kiln.ts' } },
    bench: { lane: 'kiln' },
  });

  const exitCode = await runBench([], config, ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
  expect(ctx.stopKiln).toHaveBeenCalledTimes(1);
});

test('it exits 2 for more than one name', async () => {
  const ctx = setupTest();

  const exitCode = await runBench(['boil', 'steep'], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(2);
});
