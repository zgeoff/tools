import { expect, mock, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import type { CommandOptions } from './run-command.ts';
import { runUnitTests } from './run-unit-tests.ts';
import { makeRecordingStub } from './test-utils/make-recording-stub.ts';

function setupTest() {
  const signal = new AbortController().signal;

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(0),
  );

  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return { signal, runCommand, output };
}

test.each([['--watch'], ['--coverage-reporter=lcov']])(
  'it exits 2 and runs nothing for %s when the tests need more than one run',
  async (flag) => {
    const ctx = setupTest();

    const exitCode = await runUnitTests(
      defineRig({}),
      {
        workerCount: 1,
        flags: [flag],
        tests: ['packages/oven/src/heat.test.ts', 'src/till.test.ts'],
        isDiscovery: false,
      },
      { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
      {
        dietScript: '/diet.sh',
        runCommand: ctx.runCommand,
        output: ctx.output,
        probeWorkspaceRepo: () => Promise.resolve(true),
        readTrackedFiles: () =>
          Promise.resolve(['packages/oven/package.json', 'packages/oven/bunfig.toml']),
      },
    );

    expect(exitCode).toBe(2);

    expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
      `rig: ${flag} needs the tests in one bun test run, and these tests need 2, one for each bunfig; name the tests of one bunfig\n`,
    );

    expect(ctx.runCommand).not.toHaveBeenCalled();
  },
);

test('it passes --watch on when the tests need one run', async () => {
  const ctx = setupTest();

  await runUnitTests(
    defineRig({}),
    { workerCount: 1, flags: ['--watch'], tests: ['src/till.test.ts'], isDiscovery: false },
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(false),
      readTrackedFiles: () => Promise.resolve(['src/till.test.ts']),
    },
  );

  expect(ctx.runCommand.mock.calls[0]?.[0]).toContain('--watch');
});

test('it runs the unit command under diet in the repo and returns its exit code', async () => {
  const ctx = setupTest();

  ctx.runCommand.mockResolvedValue(4);

  const exitCode = await runUnitTests(
    defineRig({}),
    { workerCount: 2, flags: [], tests: ['src/a.test.ts'], isDiscovery: false },
    { repoRoot: '/repo', environment: { PATH: '/usr/bin' }, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(false),
      readTrackedFiles: () => Promise.resolve([]),
    },
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
    { workerCount: 1, flags: [], tests: ['src/a.test.ts'], isDiscovery: true },
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(false),
      readTrackedFiles: () => Promise.resolve(['src/a.test.ts']),
    },
  );

  expect(ctx.runCommand.mock.calls[0]?.[0].slice(0, 5)).toStrictEqual([
    'bash',
    '/diet.sh',
    '--budget',
    '4G',
    '--',
  ]);
});

test('it leaves out the e2e folders that git tracks and runs a src/e2e folder that is no e2e folder', async () => {
  const ctx = setupTest();

  await runUnitTests(
    defineRig({}),
    { workerCount: 1, flags: [], tests: ['src/e2e/codec.test.ts'], isDiscovery: true },
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(false),
      readTrackedFiles: () => Promise.resolve(['e2e/login.test.ts', 'src/e2e/codec.test.ts']),
    },
  );

  const command = ctx.runCommand.mock.calls[0]?.[0] ?? [];

  expect(command).toContain('--path-ignore-patterns=e2e/**');
  expect(command).not.toContain('--path-ignore-patterns=src/e2e/**');
});

test('it runs the tests of a package with its own bunfig.toml from the package folder, after the root run', async () => {
  const ctx = setupTest();

  await runUnitTests(
    defineRig({}),
    {
      workerCount: 1,
      flags: [],
      tests: ['packages/oven/src/heat.test.ts', 'src/till.test.ts'],
      isDiscovery: false,
    },
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(true),
      readTrackedFiles: () =>
        Promise.resolve([
          'packages/oven/package.json',
          'packages/oven/bunfig.toml',
          'packages/oven/src/heat.test.ts',
          'src/till.test.ts',
        ]),
    },
  );

  expect(
    ctx.runCommand.mock.calls.map(([command, options]) => [options.cwd, command.at(-1)]),
  ).toStrictEqual([
    ['/repo', './src/till.test.ts'],
    ['/repo/packages/oven', './src/heat.test.ts'],
  ]);
});

test('it runs a test that a bunfigs entry matches from the repo root under that bunfig', async () => {
  const ctx = setupTest();

  await runUnitTests(
    defineRig({
      bunfigs: [{ path: 'bunfig.window.toml', files: ['packages/shop/**/*.test.tsx'] }],
    }),
    {
      workerCount: 1,
      flags: [],
      tests: ['packages/shop/src/counter.test.tsx'],
      isDiscovery: false,
    },
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(true),
      readTrackedFiles: () =>
        Promise.resolve(['packages/shop/package.json', 'packages/shop/src/counter.test.tsx']),
    },
  );

  expect(ctx.runCommand.mock.calls[0]?.[1].cwd).toBe('/repo');

  expect(ctx.runCommand.mock.calls[0]?.[0]).toIncludeAllMembers([
    '--config=./bunfig.window.toml',
    './packages/shop/src/counter.test.tsx',
  ]);
});

test('it runs every run after one fails and returns the first failing exit code', async () => {
  const ctx = setupTest();

  ctx.runCommand.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

  const exitCode = await runUnitTests(
    defineRig({}),
    {
      workerCount: 1,
      flags: [],
      tests: ['packages/oven/src/heat.test.ts', 'src/till.test.ts'],
      isDiscovery: false,
    },
    { repoRoot: '/repo', environment: {}, signal: ctx.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(true),
      readTrackedFiles: () =>
        Promise.resolve(['packages/oven/package.json', 'packages/oven/bunfig.toml']),
    },
  );

  expect(exitCode).toBe(3);
  expect(ctx.runCommand).toHaveBeenCalledTimes(2);
});

test('it starts no further run once the run is aborted', async () => {
  const ctx = setupTest();

  const controller = new AbortController();

  ctx.runCommand.mockImplementation(() => {
    controller.abort();

    return Promise.resolve(1);
  });

  const exitCode = await runUnitTests(
    defineRig({}),
    {
      workerCount: 1,
      flags: [],
      tests: ['packages/oven/src/heat.test.ts', 'src/till.test.ts'],
      isDiscovery: false,
    },
    { repoRoot: '/repo', environment: {}, signal: controller.signal, runID: '4417' },
    {
      dietScript: '/diet.sh',
      runCommand: ctx.runCommand,
      output: ctx.output,
      probeWorkspaceRepo: () => Promise.resolve(true),
      readTrackedFiles: () =>
        Promise.resolve(['packages/oven/package.json', 'packages/oven/bunfig.toml']),
    },
  );

  expect(exitCode).toBe(1);
  expect(ctx.runCommand).toHaveBeenCalledTimes(1);
});
