import { expect, mock, test } from 'bun:test';
import { makeRecordingStub } from '../../../test-utils/make-recording-stub.ts';
import { defineRig } from './define-rig.ts';
import type { WorkerCount } from './read-worker-count.ts';
import type { CommandOptions } from './run-command.ts';
import { runRelatedTests } from './run-related-tests.ts';

function setupTest() {
  const signal = new AbortController().signal;

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };
  const readWorkerCount = mock<() => Promise<WorkerCount>>();

  return { signal, runCommand, readWorkerCount, output };
}

test('it runs the unit lane on the related test and returns its exit code', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });
  ctx.runCommand.mockResolvedValue(1);

  const exitCode = await runRelatedTests(
    ['src/a.ts'],
    defineRig({}),
    { repoRoot: '/repo', environment: { PATH: '/usr/bin' }, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => true },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(exitCode).toBe(1);
  expect(ctx.runCommand).toHaveBeenCalledTimes(1);

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    '--parallel=2',
    './src/a.test.ts',
  ]);

  expect(ctx.runCommand.mock.calls[0]?.[0]).not.toContain('--timeout=15000');

  expect(ctx.runCommand.mock.calls[0]?.[1]).toStrictEqual({
    cwd: '/repo',
    environment: { PATH: '/usr/bin' },
    signal: ctx.signal,
  });
});

test('it leaves every lane out of the run, as the unit run does', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });

  await runRelatedTests(
    ['src/a.ts'],
    defineRig({ lanes: { kiln: { limit: '9s' } } }),
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => true },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    '--path-ignore-patterns=**/*.kiln.test.ts',
    '--path-ignore-patterns=**/*.host.test.ts',
  ]);
});

test('it adds the slow-host timeout when the host gets 1 worker', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 1 });

  await runRelatedTests(
    ['src/a.ts'],
    defineRig({}),
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => true },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    '--parallel=1',
    '--timeout=15000',
    './src/a.test.ts',
  ]);
});

test('it says so and exits 0 when no path has a related test', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });

  const exitCode = await runRelatedTests(
    ['src/a.ts'],
    defineRig({}),
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => false },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig related: no related tests\n');
  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test('it runs 50 related test files, the default cap', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });

  const paths = Array.from({ length: 50 }, (_, index) => `src/t${index}.test.ts`);

  const exitCode = await runRelatedTests(
    paths,
    defineRig({}),
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => true },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(exitCode).toBe(0);

  expect(ctx.runCommand.mock.calls[0]?.[0].slice(-50)).toStrictEqual(
    paths.map((path) => `./${path}`),
  );
});

test('it skips with the CI notice past 50 related test files', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });

  const paths = Array.from({ length: 51 }, (_, index) => `src/t${index}.test.ts`);

  const exitCode = await runRelatedTests(
    paths,
    defineRig({}),
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => true },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(exitCode).toBe(0);

  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith(
    'rig related: skipped, because the branch has 51 related unit test files, over the cap of 50; CI runs the full suite\n',
  );

  expect(ctx.runCommand).not.toHaveBeenCalled();
});

test.each([
  ['test-utils/build-order.ts'],
  ['packages/shop/test-utils/build-cart.ts'],
  ['bunfig.toml'],
])(
  'it skips with the CI notice when the branch changes the shared test input %s',
  async (shared) => {
    const ctx = setupTest();

    ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });

    const exitCode = await runRelatedTests(
      ['src/a.ts', shared],
      defineRig({}),
      { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
      {
        dietScript: '/diet.sh',
        readTrackedFiles: () => Promise.resolve([]),
        sources: { cwd: '/repo', probeFile: () => true },
        readWorkerCount: ctx.readWorkerCount,
        runCommand: ctx.runCommand,
        output: ctx.output,
      },
    );

    expect(exitCode).toBe(0);

    expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith(
      `rig related: skipped, because the branch changes ${shared}, a shared test helper or config; CI runs the full suite\n`,
    );

    expect(ctx.runCommand).not.toHaveBeenCalled();
  },
);

test('it names the shared test input over the file cap when the branch changes both', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });

  const paths = Array.from({ length: 51 }, (_, index) => `src/t${index}.test.ts`);

  await runRelatedTests(
    [...paths, 'bunfig.toml'],
    defineRig({}),
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => true },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith(
    'rig related: skipped, because the branch changes bunfig.toml, a shared test helper or config; CI runs the full suite\n',
  );
});

test.each([['--max-files=2'], ['--max-file=2']])(
  'it exits 2 for the option %s, which it does not declare',
  async (option) => {
    const ctx = setupTest();

    ctx.readWorkerCount.mockResolvedValue({ kind: 'count', count: 2 });

    const exitCode = await runRelatedTests(
      [option, 'src/a.ts'],
      defineRig({}),
      { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
      {
        dietScript: '/diet.sh',
        readTrackedFiles: () => Promise.resolve([]),
        sources: { cwd: '/repo', probeFile: () => true },
        readWorkerCount: ctx.readWorkerCount,
        runCommand: ctx.runCommand,
        output: ctx.output,
      },
    );

    expect(exitCode).toBe(2);

    expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
      expect.toStartWith(`rig related: Unknown option '${option.split('=')[0]}'`),
    );

    expect(ctx.runCommand).not.toHaveBeenCalled();
  },
);

test('it exits 2 with the reason and runs no test for a worker count it refuses', async () => {
  const ctx = setupTest();

  ctx.readWorkerCount.mockResolvedValue({
    kind: 'invalid',
    message: 'TEST_WORKERS is four; set it to a whole number above 0',
  });

  const exitCode = await runRelatedTests(
    ['src/a.ts'],
    defineRig({}),
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      readTrackedFiles: () => Promise.resolve([]),
      sources: { cwd: '/repo', probeFile: () => true },
      readWorkerCount: ctx.readWorkerCount,
      runCommand: ctx.runCommand,
      output: ctx.output,
    },
  );

  expect(exitCode).toBe(2);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig related: TEST_WORKERS is four; set it to a whole number above 0\n',
  );

  expect(ctx.runCommand).not.toHaveBeenCalled();
});
